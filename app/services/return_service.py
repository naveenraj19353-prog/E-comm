from __future__ import annotations

from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException

from app.database.mongo import orders
from app.services.delhivery_service import DelhiveryError, DelhiveryService
from app.services.order_fulfillment import restore_variant_stock
from app.services.shipping_context import get_active_delhivery_context
from app.utils.razorpay_client import client as razorpay_client

RETURN_WINDOW_DAYS = 2
RETURN_OPEN_STATUSES = {"requested", "approved"}
RETURN_BLOCKED_STATUSES = {"rejected", "received", "refunded"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_return(order: dict) -> dict | None:
    data = order.get("returnRequest")
    if not isinstance(data, dict) or not data.get("status"):
        return None
    return {
        "status": data.get("status"),
        "reason": data.get("reason") or "",
        "rejectReason": data.get("rejectReason") or "",
        "requestedAt": data.get("requestedAt"),
        "approvedAt": data.get("approvedAt"),
        "rejectedAt": data.get("rejectedAt"),
        "receivedAt": data.get("receivedAt"),
        "refundedAt": data.get("refundedAt"),
        "refundId": data.get("refundId"),
        "refundStatus": data.get("refundStatus"),
        "refundNote": data.get("refundNote") or "",
        "reverseAwb": data.get("reverseAwb"),
        "reverseTrackingUrl": data.get("reverseTrackingUrl"),
        "reverseNote": data.get("reverseNote") or "",
        "stockRestored": bool(data.get("stockRestored")),
        "windowDays": RETURN_WINDOW_DAYS,
    }


def delivered_at(order: dict) -> datetime | None:
    for key in ("deliveredAt", "updatedAt", "createdAt"):
        value = order.get(key)
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value
    return None


def can_customer_request_return(order: dict, *, now: datetime | None = None) -> bool:
    if str(order.get("channel") or "") == "menu":
        return False
    if str(order.get("orderStatus") or "") != "delivered":
        return False
    existing = order.get("returnRequest")
    if isinstance(existing, dict):
        status = str(existing.get("status") or "")
        if status in RETURN_OPEN_STATUSES or status in {"received", "refunded"}:
            return False
    stamp = delivered_at(order)
    if not stamp:
        return False
    clock = now or _now()
    return clock - stamp <= timedelta(days=RETURN_WINDOW_DAYS)


def _load_order(order_id: str, tenant_id: str) -> dict:
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=400, detail="Invalid order ID.")
    order = orders.find_one({"_id": ObjectId(order_id), "tenantId": tenant_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


def _save_return(order: dict, payload: dict, order_status: str) -> dict:
    now = _now()
    orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "returnRequest": payload,
                "orderStatus": order_status,
                "updatedAt": now,
            }
        },
    )
    return orders.find_one({"_id": order["_id"]}) or order


def request_return(
    *,
    order_id: str,
    tenant_id: str,
    user_id: str,
    reason: str,
) -> dict:
    order = _load_order(order_id, tenant_id)
    if str(order.get("userId")) != str(user_id):
        raise HTTPException(status_code=403, detail="You cannot return this order.")
    if not can_customer_request_return(order):
        raise HTTPException(
            status_code=400,
            detail=(
                "Returns are available for 2 days after delivery. "
                "This order cannot be returned."
            ),
        )
    note = str(reason or "").strip()
    if len(note) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please describe why you want to return this order.",
        )
    now = _now()
    payload = {
        "status": "requested",
        "reason": note[:500],
        "requestedAt": now,
        "stockRestored": False,
    }
    return _save_return(order, payload, "return_requested")


def reject_return(*, order_id: str, tenant_id: str, reason: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    if str(current.get("status") or "") != "requested":
        raise HTTPException(status_code=400, detail="No pending return to reject.")
    note = str(reason or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A reject reason is required.")
    now = _now()
    payload = {
        **current,
        "status": "rejected",
        "rejectReason": note[:500],
        "rejectedAt": now,
    }
    return _save_return(order, payload, "delivered")


def _consignee_address(order: dict) -> dict:
    address = order.get("address") if isinstance(order.get("address"), dict) else {}
    return address


def approve_return(*, order_id: str, tenant_id: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    if str(current.get("status") or "") != "requested":
        raise HTTPException(status_code=400, detail="No pending return to approve.")

    now = _now()
    payload = {
        **current,
        "status": "approved",
        "approvedAt": now,
        "reverseNote": "",
    }
    address = _consignee_address(order)
    ctx = get_active_delhivery_context(tenant_id)
    location = (ctx or {}).get("location") if ctx else None
    if ctx and isinstance(location, dict):
        items = order.get("items") if isinstance(order.get("items"), list) else []
        products_desc = (
            ", ".join(str(item.get("name") or "Item")[:40] for item in items[:5])
            or "Return goods"
        )
        try:
            result = DelhiveryService().create_reverse_shipment(
                tenant_id,
                pickup_location_name=ctx["pickupLocationName"],
                order_id=str(order["_id"]),
                consignee_name=str(address.get("fullName") or "Customer"),
                consignee_phone=str(address.get("phone") or ""),
                address=" ".join(
                    part
                    for part in [
                        str(address.get("addressLine1") or "").strip(),
                        str(address.get("addressLine2") or "").strip(),
                    ]
                    if part
                ),
                city=str(address.get("city") or ""),
                state=str(address.get("state") or ""),
                pincode=str(address.get("postalCode") or ""),
                country=str(address.get("country") or "India"),
                return_name=str(location.get("name") or ctx["pickupLocationName"]),
                return_address=str(location.get("address") or ""),
                return_city=str(location.get("city") or ""),
                return_state=str(location.get("state") or ""),
                return_pincode=str(location.get("pincode") or ctx.get("originPin") or ""),
                return_phone=str(location.get("phone") or ""),
                products_description=products_desc,
            )
            payload["reverseAwb"] = result["waybill"]
            payload["reverseTrackingUrl"] = result["trackingUrl"]
        except DelhiveryError as error:
            payload["reverseNote"] = str(error)[:400]
        except Exception as error:
            payload["reverseNote"] = str(error)[:400]
    else:
        payload["reverseNote"] = (
            "Delhivery is not connected. Arrange reverse pickup manually."
        )
    return _save_return(order, payload, "return_approved")


def mark_return_received(*, order_id: str, tenant_id: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    if str(current.get("status") or "") not in {"approved", "received"}:
        raise HTTPException(status_code=400, detail="Approve the return before marking it received.")
    now = _now()
    if not current.get("stockRestored"):
        for item in order.get("items") or []:
            variant_id = item.get("variantId")
            product_id = item.get("productId")
            if not variant_id or not product_id:
                continue
            restore_variant_stock(
                product_id if isinstance(product_id, ObjectId) else ObjectId(str(product_id)),
                str(variant_id),
                int(item.get("quantity", 0)),
                now,
            )
    payload = {
        **current,
        "status": "received",
        "receivedAt": now,
        "stockRestored": True,
    }
    return _save_return(order, payload, "returned")


def _is_cod(order: dict) -> bool:
    method = str(order.get("paymentMethod") or "").lower()
    return method in {"cod", "cash_on_delivery"}


def issue_refund(*, order_id: str, tenant_id: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    status = str(current.get("status") or "")
    if status not in {"received", "refunded"}:
        raise HTTPException(
            status_code=400,
            detail="Mark the return as received before refunding.",
        )
    if status == "refunded" and current.get("refundId"):
        return order

    now = _now()
    payload = {**current, "status": "refunded", "refundedAt": now}
    payment_id = str(order.get("razorpayPaymentId") or "").strip()

    if _is_cod(order) or not payment_id:
        payload["refundStatus"] = "manual"
        payload["refundNote"] = "COD or unpaid online — refund the customer outside Razorpay."
        orders.update_one(
            {"_id": order["_id"]},
            {
                "$set": {
                    "returnRequest": payload,
                    "orderStatus": "refunded",
                    "paymentStatus": "refunded" if not _is_cod(order) else order.get("paymentStatus"),
                    "refundStatus": payload["refundStatus"],
                    "updatedAt": now,
                }
            },
        )
        return orders.find_one({"_id": order["_id"]}) or order

    try:
        refund_data = razorpay_client.payment.refund(payment_id)
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"Razorpay refund failed: {error}",
        ) from error

    payload["refundId"] = (refund_data or {}).get("id")
    payload["refundStatus"] = (refund_data or {}).get("status") or "processed"
    payload["refundNote"] = "Refunded to original Razorpay payment."
    orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "returnRequest": payload,
                "orderStatus": "refunded",
                "paymentStatus": "refunded",
                "refundStatus": payload["refundStatus"],
                "updatedAt": now,
            }
        },
    )
    return orders.find_one({"_id": order["_id"]}) or order
