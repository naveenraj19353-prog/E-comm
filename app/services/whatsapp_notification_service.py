"""Provider-neutral WhatsApp notification orchestration and durable send logs."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from bson import ObjectId
from fastapi import BackgroundTasks
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database.mongo import (
    messaging_integrations,
    notification_logs,
    orders,
    tenants,
    users,
)
from app.services.periskope_service import PeriskopeError, PeriskopeService
from app.services.s3_service import generate_presigned_url, is_s3_object_key
from app.services.storefront_url import build_customer_storefront_url
from app.utils.phone_normalization import (
    PhoneNormalizationError,
    mask_phone,
    normalize_phone,
)

logger = logging.getLogger(__name__)
PROVIDER = "periskope"

DEFAULT_NOTIFICATIONS = {
    "orderConfirmation": True,
    "paymentSuccess": True,
    "shipmentUpdates": True,
    "deliveryUpdates": True,
    "cancellation": True,
}

EVENT_PREFERENCE = {
    "order.confirmed": "orderConfirmation",
    "payment.succeeded": "paymentSuccess",
    "order.processing": "shipmentUpdates",
    "order.shipped": "shipmentUpdates",
    "shipment.created": "shipmentUpdates",
    "order.delivered": "deliveryUpdates",
    "order.cancelled": "cancellation",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _order_number(order: dict) -> str:
    raw = str(order.get("orderNumber") or order.get("_id") or "")[-8:].upper()
    return "".join(character for character in raw if character.isalnum())


def _clean_text(value: Any, fallback: str, max_length: int = 100) -> str:
    text = " ".join(
        str(value or "").replace("*", "").replace("\ufffd", "").split()
    )
    text = "".join(character for character in text if character.isprintable())
    return (text[:max_length].strip() or fallback)


def _customer(order: dict) -> dict:
    address = order.get("address")
    address = address if isinstance(address, dict) else {}
    user = None
    user_id = order.get("userId")
    if user_id and ObjectId.is_valid(str(user_id)):
        user = users.find_one(
            {"_id": ObjectId(str(user_id)), "tenantId": order.get("tenantId")}
        )
    return {
        "id": str(user_id or ""),
        "name": _clean_text(
            (user or {}).get("name")
            or address.get("fullName")
            or "Customer",
            "Customer",
        ),
        "phone": address.get("phone") or order.get("phone") or (user or {}).get("phone"),
        "country": address.get("country"),
    }


def _store(order: dict) -> dict:
    tenant = tenants.find_one({"tenantId": order.get("tenantId")}) or {}
    slug = tenant.get("slug") or order.get("tenantId") or ""
    return {
        "name": _clean_text(tenant.get("name"), "Store"),
        "slug": slug,
        "logo": tenant.get("logo") or "",
        "ordersUrl": build_customer_storefront_url(str(slug), "/orders"),
    }


def _safe_customer_url(value: Any) -> str:
    url = str(value or "").strip()
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        return ""
    return url


def _item_details(order: dict) -> str:
    items = order.get("items") if isinstance(order.get("items"), list) else []
    first_item = items[0] if items and isinstance(items[0], dict) else {}
    name = _clean_text(first_item.get("name"), "Item", 120)
    try:
        quantity = max(1, int(first_item.get("quantity") or 1))
    except (TypeError, ValueError):
        quantity = 1
    more = f"\n+{len(items) - 1} more item(s)" if len(items) > 1 else ""
    return f"📦 *{name}*\nQty: {quantity}{more}"


def _cta_line(event_type: str, order: dict, store: dict) -> str:
    courier = order.get("courier") if isinstance(order.get("courier"), dict) else {}
    tracking_url = _safe_customer_url(courier.get("trackingUrl"))
    orders_url = _safe_customer_url(store.get("ordersUrl"))
    if event_type in {"order.shipped", "shipment.created"}:
        url = tracking_url or orders_url
        return f"\n\n🔗 *Track Order:* {url}" if url else ""
    return f"\n\n🔗 *View Order:* {orders_url}" if orders_url else ""


def _branding(store: dict) -> str:
    return f"\n\n*{store['name']}*\nPowered by Retail Cosmos"


def _refund_line(order: dict) -> str:
    refund_status = _clean_text(order.get("refundStatus"), "", 40)
    if refund_status:
        return f"\nRefund status: {refund_status}"
    if str(order.get("paymentStatus") or "").lower() == "paid":
        return "\nPayment was received. Refund information will be shared separately."
    return ""


def _message_for(event_type: str, order: dict, customer: dict, store: dict) -> str:
    name = customer["name"]
    number = _order_number(order)
    amount = float(order.get("totalAmount") or 0)
    item_details = _item_details(order)

    if event_type == "order.confirmed":
        return (
            "🟢 *ORDER CONFIRMED*\n\n"
            f"Hi {name} 👋\n\nYour order *#{number}* is being processed.\n\n"
            f"{item_details}\nAmount: ₹{amount:,.2f}\n\n"
            "We'll notify you when your order is shipped."
            f"{_cta_line(event_type, order, store)}"
            f"{_branding(store)}"
        )
    if event_type == "payment.succeeded":
        return (
            "✅ *PAYMENT SUCCESSFUL*\n\n"
            f"Hi {name} 👋\n\nPayment for order *#{number}* was successful.\n\n"
            f"{item_details}\nAmount paid: ₹{amount:,.2f}"
            f"{_cta_line(event_type, order, store)}"
            f"{_branding(store)}"
        )
    if event_type in {"order.shipped", "shipment.created"}:
        return (
            "🚚 *ORDER SHIPPED*\n\n"
            f"Hi {name} 👋\n\nGood news! Your order *#{number}* has been shipped.\n\n"
            f"{item_details}\n\nYour package is on its way."
            f"{_cta_line(event_type, order, store)}"
            f"{_branding(store)}"
        )
    if event_type == "order.processing":
        return (
            "🟢 *ORDER PROCESSING*\n\n"
            f"Hi {name} 👋\n\nYour order *#{number}* is being prepared.\n\n"
            f"{item_details}"
            f"{_cta_line(event_type, order, store)}"
            f"{_branding(store)}"
        )
    if event_type == "order.delivered":
        return (
            "🎉 *ORDER DELIVERED*\n\n"
            f"Hi {name} 👋\n\nYour order *#{number}* has been delivered.\n\n"
            f"{item_details}\n\nWe hope you love your purchase!"
            f"{_cta_line(event_type, order, store)}"
            f"{_branding(store)}"
        )
    if event_type == "order.cancelled":
        return (
            "❌ *ORDER CANCELLED*\n\n"
            f"Hi {name},\n\nYour order *#{number}* has been cancelled.\n\n"
            f"{item_details}\nAmount: ₹{amount:,.2f}"
            f"{_refund_line(order)}"
            f"{_cta_line(event_type, order, store)}"
            f"{_branding(store)}"
        )
    raise ValueError(f"Unsupported notification event: {event_type}")


def _public_image_url(order: dict, store: dict) -> str | None:
    candidates = []
    items = order.get("items") if isinstance(order.get("items"), list) else []
    if items and isinstance(items[0], dict):
        candidates.append(items[0].get("image"))
    candidates.append(store.get("logo"))

    for candidate in candidates:
        value = str(candidate or "").strip()
        if not value:
            continue
        if is_s3_object_key(value):
            try:
                value = generate_presigned_url(value)
            except RuntimeError:
                continue
        parsed = urlparse(value)
        if (
            parsed.scheme in {"http", "https"}
            and parsed.netloc
            and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
        ):
            return value
    return None


def _image_metadata(url: str) -> tuple[str, str]:
    path = urlparse(url).path.lower()
    if path.endswith(".png"):
        return "order-update.png", "image/png"
    if path.endswith(".webp"):
        return "order-update.webp", "image/webp"
    if path.endswith(".gif"):
        return "order-update.gif", "image/gif"
    return "order-update.jpg", "image/jpeg"


def _message_id(payload: dict[str, Any]) -> str | None:
    for key in ("message_id", "messageId", "unique_id", "queue_id", "id"):
        value = payload.get(key)
        if value:
            return str(value)
    data = payload.get("data")
    if isinstance(data, dict):
        return _message_id(data)
    return None


def schedule_order_notification(
    background_tasks: BackgroundTasks,
    *,
    order_id: str,
    event_type: str,
) -> bool:
    if event_type not in EVENT_PREFERENCE or not ObjectId.is_valid(str(order_id)):
        return False
    now = _now()
    idempotency_key = f"order:{order_id}:{event_type}"
    try:
        order = orders.find_one(
            {"_id": ObjectId(str(order_id))},
            {"tenantId": 1},
        )
        if not order or not order.get("tenantId"):
            return False
        result = notification_logs.insert_one(
            {
                "idempotencyKey": idempotency_key,
                "provider": PROVIDER,
                "tenantId": str(order["tenantId"]).strip().lower(),
                "eventType": event_type,
                "orderId": str(order_id),
                "status": "pending",
                "attempts": 0,
                "createdAt": now,
                "updatedAt": now,
            }
        )
    except DuplicateKeyError:
        return False
    except PyMongoError:
        logger.exception(
            "[WHATSAPP] event=%s order=%s status=log_failed",
            event_type,
            order_id,
        )
        return False
    background_tasks.add_task(process_notification, str(result.inserted_id))
    return True


def send_order_confirmation(
    background_tasks: BackgroundTasks,
    order_id: str,
) -> bool:
    return schedule_order_notification(
        background_tasks,
        order_id=order_id,
        event_type="order.confirmed",
    )


def send_payment_success(
    background_tasks: BackgroundTasks,
    order_id: str,
) -> bool:
    return schedule_order_notification(
        background_tasks,
        order_id=order_id,
        event_type="payment.succeeded",
    )


def send_order_status_update(
    background_tasks: BackgroundTasks,
    order_id: str,
    status: str,
) -> bool:
    return schedule_order_notification(
        background_tasks,
        order_id=order_id,
        event_type=f"order.{status}",
    )


def send_shipment_created(
    background_tasks: BackgroundTasks,
    order_id: str,
) -> bool:
    return schedule_order_notification(
        background_tasks,
        order_id=order_id,
        event_type="shipment.created",
    )


def process_notification(notification_id: str) -> None:
    if not ObjectId.is_valid(notification_id):
        return
    log_id = ObjectId(notification_id)
    notification = notification_logs.find_one({"_id": log_id})
    if not notification or notification.get("status") == "sent":
        return

    order = orders.find_one({"_id": ObjectId(notification["orderId"])})
    if not order:
        notification_logs.update_one(
            {"_id": log_id},
            {"$set": {"status": "failed", "error": "Order not found.", "updatedAt": _now()}},
        )
        return

    tenant_id = str(order.get("tenantId") or "").strip().lower()
    integration = messaging_integrations.find_one(
        {"tenantId": tenant_id, "provider": PROVIDER}
    )
    preferences = {
        **DEFAULT_NOTIFICATIONS,
        **((integration or {}).get("notifications") or {}),
    }
    preference = EVENT_PREFERENCE[notification["eventType"]]
    if not integration or not integration.get("enabled") or not preferences.get(preference):
        notification_logs.update_one(
            {"_id": log_id},
            {
                "$set": {
                    "tenantId": tenant_id,
                    "status": "skipped",
                    "error": "Notification is disabled.",
                    "updatedAt": _now(),
                }
            },
        )
        return

    customer = _customer(order)
    try:
        phone = normalize_phone(customer["phone"], country=customer["country"])
        store = _store(order)
        message = _message_for(notification["eventType"], order, customer, store)
        media_url = _public_image_url(order, store)
        notification_logs.update_one(
            {"_id": log_id},
            {
                "$set": {
                    "tenantId": tenant_id,
                    "customerId": customer["id"],
                    "phone": mask_phone(phone),
                    "status": "sending",
                    "updatedAt": _now(),
                },
                "$inc": {"attempts": 1},
                "$unset": {"error": ""},
            },
        )
        service = PeriskopeService()
        if media_url:
            filename, mimetype = _image_metadata(media_url)
            response = service.send_media_message(
                f"{phone}@c.us",
                message,
                media_url=media_url,
                filename=filename,
                mimetype=mimetype,
            )
        else:
            response = service.send_text_message(f"{phone}@c.us", message)
        notification_logs.update_one(
            {"_id": log_id},
            {
                "$set": {
                    "status": "sent",
                    "messageId": _message_id(response),
                    "hasMedia": bool(media_url),
                    "sentAt": _now(),
                    "updatedAt": _now(),
                }
            },
        )
        logger.info(
            "[WHATSAPP] tenant=%s event=%s order=%s phone=%s status=sent",
            tenant_id,
            notification["eventType"],
            notification["orderId"],
            mask_phone(phone),
        )
    except (PhoneNormalizationError, PeriskopeError, ValueError) as error:
        notification_logs.update_one(
            {"_id": log_id},
            {
                "$set": {
                    "tenantId": tenant_id,
                    "status": "failed",
                    "error": str(error)[:300],
                    "updatedAt": _now(),
                }
            },
        )
        logger.warning(
            "[WHATSAPP] tenant=%s event=%s order=%s status=failed reason=%s",
            tenant_id,
            notification["eventType"],
            notification["orderId"],
            type(error).__name__,
        )
    except Exception as error:
        notification_logs.update_one(
            {"_id": log_id},
            {
                "$set": {
                    "tenantId": tenant_id,
                    "status": "failed",
                    "error": "Unexpected notification error.",
                    "updatedAt": _now(),
                }
            },
        )
        logger.exception(
            "[WHATSAPP] tenant=%s event=%s order=%s status=unexpected_error",
            tenant_id,
            notification["eventType"],
            notification["orderId"],
        )


def retry_notification(
    background_tasks: BackgroundTasks,
    *,
    notification_id: str,
    tenant_id: str,
) -> bool:
    if not ObjectId.is_valid(notification_id):
        return False
    result = notification_logs.update_one(
        {
            "_id": ObjectId(notification_id),
            "tenantId": tenant_id,
            "status": {"$in": ["failed", "skipped"]},
        },
        {"$set": {"status": "pending", "updatedAt": _now()}, "$unset": {"error": ""}},
    )
    if result.modified_count:
        background_tasks.add_task(process_notification, notification_id)
        return True
    return False
