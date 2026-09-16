from datetime import datetime, timedelta, timezone
import hashlib
import hmac

from bson import ObjectId
from fastapi import HTTPException

from app.database.mongo import carts, orders, tenants, users
from app.services.checkout_service import (
    calculate_checkout,
    cart_owner_query,
    normalize_tenant_id,
    tenant_id_query,
)
from app.services.order_fulfillment import (
    _apply_order_side_effects,
    _build_order_items,
    _insert_order,
    _reserve_stock,
)
from app.utils.hash import hash_password
from app.utils.jwt_handler import SECRET_KEY

_MENU_TIMEZONE = timezone(timedelta(hours=5, minutes=30))
_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def require_menu_tenant(tenant_id: str) -> dict:
    tenant_id = normalize_tenant_id(tenant_id)
    tenant = tenants.find_one({"tenantId": tenant_id, "isActive": True})
    if not tenant:
        raise HTTPException(status_code=404, detail="Store not found or inactive.")
    if str(tenant.get("businessType") or "").strip().lower() != "menu":
        raise HTTPException(
            status_code=400,
            detail="This store is not configured for menu ordering.",
        )
    return tenant


def _daily_password_details(tenant_id: str) -> tuple[str, str, datetime]:
    local_now = datetime.now(_MENU_TIMEZONE)
    valid_date = local_now.date().isoformat()
    message = f"menu-password:{tenant_id}:{valid_date}".encode()
    digest = hmac.new(
        SECRET_KEY.encode(),
        message,
        hashlib.sha256,
    ).digest()
    password = "".join(
        _PASSWORD_ALPHABET[value % len(_PASSWORD_ALPHABET)]
        for value in digest[:6]
    )
    next_midnight = datetime.combine(
        local_now.date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=_MENU_TIMEZONE,
    )
    return password, valid_date, next_midnight.astimezone(timezone.utc)


def get_daily_password_status(tenant_id: str) -> dict:
    require_menu_tenant(tenant_id)
    tenant_id = normalize_tenant_id(tenant_id)
    password, valid_date, expires_at = _daily_password_details(tenant_id)
    return {
        "success": True,
        "isSet": True,
        "password": password,
        "validDate": valid_date,
        "expiresAt": expires_at,
    }


def rotate_daily_password(tenant_id: str) -> dict:
    """Compatibility endpoint: a day's password cannot be rotated."""
    require_menu_tenant(tenant_id)
    tenant_id = normalize_tenant_id(tenant_id)
    password, valid_date, expires_at = _daily_password_details(tenant_id)
    return {
        "success": True,
        "password": password,
        "isSet": True,
        "validDate": valid_date,
        "expiresAt": expires_at,
        "message": "This password is fixed for the current calendar day.",
    }


def verify_daily_password(tenant_id: str, password: str) -> None:
    tenant_id = normalize_tenant_id(tenant_id)
    expected, _valid_date, _expires_at = _daily_password_details(tenant_id)
    if not hmac.compare_digest(password.strip().upper(), expected):
        raise HTTPException(
            status_code=401,
            detail="Invalid daily password. Ask staff for today’s code.",
        )


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if len(digits) < 8 or len(digits) > 15:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number.")
    return digits


def normalize_counter_number(counter_number: str) -> str:
    value = str(counter_number or "").strip()
    if not value or len(value) > 40:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid table / room number.",
        )
    return value


def upsert_menu_guest(
    tenant_id: str,
    phone: str,
    counter_number: str | None = None,
) -> dict:
    tenant_id = normalize_tenant_id(tenant_id)
    phone = normalize_phone(phone)
    now = datetime.now(timezone.utc)
    existing = users.find_one(
        {
            "tenantId": tenant_id,
            "phone": phone,
            "role": "customer",
        }
    )
    updates: dict = {"updatedAt": now, "isActive": True}
    if counter_number:
        updates["counterNumber"] = normalize_counter_number(counter_number)
    if existing:
        users.update_one({"_id": existing["_id"]}, {"$set": updates})
        existing.update(updates)
        return existing

    email = f"{phone}@menu.{tenant_id}.local"
    payload = {
        "tenantId": tenant_id,
        "name": f"Guest {phone[-4:]}",
        "email": email,
        "phone": phone,
        "password": hash_password(f"menu-{phone}-{tenant_id}"),
        "role": "customer",
        "authChannel": "menu",
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    }
    if counter_number:
        payload["counterNumber"] = normalize_counter_number(counter_number)
    result = users.insert_one(payload)
    payload["_id"] = result.inserted_id
    return payload


def fulfill_menu_order(
    *,
    tenant_id: str,
    user_id: str,
    counter_number: str,
    phone: str,
) -> dict:
    require_menu_tenant(tenant_id)
    tenant_id = normalize_tenant_id(tenant_id)
    counter_number = normalize_counter_number(counter_number)
    phone = normalize_phone(phone)

    checkout_data = calculate_checkout(
        tenant_id=tenant_id,
        user_id=user_id,
        coupon_code=None,
        address_id=None,
        require_address=False,
        delivery_method="standard",
    )
    # Dine-in / hotel menu: no delivery charge.
    checkout_data["shipping"] = 0.0
    checkout_data["grandTotal"] = round(
        float(checkout_data["subtotal"]) - float(checkout_data.get("discount") or 0),
        2,
    )
    checkout_data["deliveryMethod"] = "dine_in"
    checkout_data["address"] = None

    order_items = _build_order_items(checkout_data)
    now = datetime.now(timezone.utc)
    if not _reserve_stock(order_items, now):
        raise HTTPException(
            status_code=409,
            detail="Stock changed while placing the order. Please try again.",
        )

    order_document = {
        "tenantId": tenant_id,
        "userId": ObjectId(str(user_id)),
        "channel": "menu",
        "counterNumber": counter_number,
        "phone": phone,
        "items": order_items,
        "subtotal": checkout_data["subtotal"],
        "discount": checkout_data.get("discount") or 0,
        "shipping": 0.0,
        "totalAmount": checkout_data["grandTotal"],
        "couponCode": None,
        "deliveryMethod": "dine_in",
        "address": None,
        "paymentMethod": "counter",
        "paymentStatus": "pending",
        "orderStatus": "open",
        "createdAt": now,
        "updatedAt": now,
    }
    order_document, _inserted = _insert_order(
        order_document,
        razorpay_order_id=None,
        check_existing=False,
    )
    _apply_order_side_effects(checkout_data, tenant_id, user_id, now)

    return {
        "success": True,
        "message": "Order sent to counter.",
        "orderId": str(order_document["_id"]),
        "amount": order_document.get("totalAmount"),
        "paymentStatus": "pending",
        "orderStatus": "open",
        "counterNumber": counter_number,
    }


def list_menu_carts(tenant_id: str) -> dict:
    require_menu_tenant(tenant_id)
    tenant_id = normalize_tenant_id(tenant_id)
    cursor = carts.find({"tenantId": tenant_id_query(tenant_id)})
    by_user: dict[str, list] = {}
    for item in cursor:
        user_key = str(item.get("userId") or "")
        if not user_key:
            continue
        by_user.setdefault(user_key, []).append(item)

    data = []
    for user_id, cart_items in by_user.items():
        try:
            checkout = calculate_checkout(
                tenant_id=tenant_id,
                user_id=user_id,
                coupon_code=None,
                address_id=None,
                require_address=False,
                delivery_method="standard",
            )
        except HTTPException:
            continue
        if not checkout.get("items"):
            continue
        user = None
        if ObjectId.is_valid(user_id):
            user = users.find_one({"_id": ObjectId(user_id)})
        data.append(
            {
                "userId": user_id,
                "phone": (user or {}).get("phone") or "",
                "name": (user or {}).get("name") or "Guest",
                "counterNumber": (user or {}).get("counterNumber") or "—",
                "itemCount": sum(int(i.get("quantity") or 0) for i in cart_items),
                "subtotal": checkout["subtotal"],
                "totalAmount": round(
                    float(checkout["subtotal"]) - float(checkout.get("discount") or 0),
                    2,
                ),
                "items": checkout["items"],
                "updatedAt": max(
                    (
                        item.get("updatedAt") or item.get("createdAt")
                        for item in cart_items
                        if item.get("updatedAt") or item.get("createdAt")
                    ),
                    default=None,
                ),
            }
        )

    data.sort(
        key=lambda row: (
            str(row.get("counterNumber") or ""),
            str(row.get("phone") or ""),
        )
    )
    return {"success": True, "count": len(data), "data": data}


def settle_menu_cart(tenant_id: str, user_id: str) -> dict:
    """Convert a live guest cart into a closed paid menu order."""
    require_menu_tenant(tenant_id)
    tenant_id = normalize_tenant_id(tenant_id)
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid guest id.")
    user = users.find_one(
        {
            "_id": ObjectId(user_id),
            "tenantId": tenant_id,
            "role": "customer",
        }
    )
    if not user:
        raise HTTPException(status_code=404, detail="Guest not found.")

    if not user.get("counterNumber"):
        counter_number = "Unassigned"
    else:
        counter_number = normalize_counter_number(str(user["counterNumber"]))

    if not user.get("phone"):
        raise HTTPException(status_code=400, detail="Guest mobile number is missing.")
    phone = normalize_phone(str(user["phone"]))

    checkout_data = calculate_checkout(
        tenant_id=tenant_id,
        user_id=user_id,
        coupon_code=None,
        address_id=None,
        require_address=False,
        delivery_method="standard",
    )
    checkout_data["shipping"] = 0.0
    checkout_data["grandTotal"] = round(
        float(checkout_data["subtotal"]) - float(checkout_data.get("discount") or 0),
        2,
    )
    checkout_data["deliveryMethod"] = "dine_in"
    checkout_data["address"] = None

    order_items = _build_order_items(checkout_data)
    now = datetime.now(timezone.utc)
    if not _reserve_stock(order_items, now):
        raise HTTPException(
            status_code=409,
            detail="Stock changed while settling the cart. Please try again.",
        )

    order_document = {
        "tenantId": tenant_id,
        "userId": ObjectId(str(user_id)),
        "channel": "menu",
        "counterNumber": counter_number,
        "phone": phone,
        "items": order_items,
        "subtotal": checkout_data["subtotal"],
        "discount": checkout_data.get("discount") or 0,
        "shipping": 0.0,
        "totalAmount": checkout_data["grandTotal"],
        "couponCode": None,
        "deliveryMethod": "dine_in",
        "address": None,
        "paymentMethod": "counter",
        "paymentStatus": "paid",
        "orderStatus": "closed",
        "paidAt": now,
        "createdAt": now,
        "updatedAt": now,
    }
    order_document, _inserted = _insert_order(
        order_document,
        razorpay_order_id=None,
        check_existing=False,
    )
    _apply_order_side_effects(checkout_data, tenant_id, user_id, now)
    return {
        "success": True,
        "message": "Payment marked done. Cart cleared and order closed.",
        "order": order_document,
    }


def mark_menu_payment_done(tenant_id: str, order_id: str) -> dict:
    tenant_id = normalize_tenant_id(tenant_id)
    require_menu_tenant(tenant_id)
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order ID.")

    order = orders.find_one(
        {
            "_id": object_id,
            "tenantId": tenant_id,
            "channel": "menu",
        }
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order.get("orderStatus") != "open" or order.get("paymentStatus") != "pending":
        raise HTTPException(
            status_code=400,
            detail="Only open unpaid menu orders can be marked as paid.",
        )

    now = datetime.now(timezone.utc)
    orders.update_one(
        {"_id": object_id},
        {
            "$set": {
                "paymentStatus": "paid",
                "orderStatus": "closed",
                "paidAt": now,
                "updatedAt": now,
            }
        },
    )
    updated = orders.find_one({"_id": object_id})
    return {
        "success": True,
        "message": "Payment marked done. Order closed.",
        "order": updated,
    }
