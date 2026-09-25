"""Coupon validation, admin serialization, and festival home copy."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.database.mongo import coupons, orders, products
from app.services.checkout_service import (
    as_object_id,
    cart_owner_query,
    find_active_product,
    tenant_id_query,
)

OFFER_TYPES = {"general", "first_order", "product", "category", "festival"}


def offer_type_of(coupon: dict | None) -> str:
    raw = str((coupon or {}).get("offerType") or "general").strip().lower()
    return raw if raw in OFFER_TYPES else "general"


def _as_utc(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return None


def serialize_coupon(coupon: dict) -> dict:
    data = dict(coupon)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    for key in ("startDate", "endDate", "createdAt", "updatedAt"):
        parsed = _as_utc(data.get(key))
        if parsed:
            data[key] = parsed.isoformat()
    data["offerType"] = offer_type_of(data)
    data["productId"] = str(data.get("productId") or "") or None
    data["categoryId"] = str(data.get("categoryId") or "") or None
    data["festivalTitle"] = data.get("festivalTitle") or ""
    data["festivalMessage"] = data.get("festivalMessage") or ""
    return data


def _require_dates(coupon: dict, now: datetime) -> None:
    start = _as_utc(coupon.get("startDate"))
    end = _as_utc(coupon.get("endDate"))
    if start and start > now:
        raise HTTPException(status_code=400, detail="Coupon is not active yet.")
    if end and end < now:
        raise HTTPException(status_code=400, detail="Coupon has expired.")


def _customer_has_prior_order(tenant_id: str, user_id: str) -> bool:
    query = cart_owner_query(tenant_id, user_id)
    query["orderStatus"] = {"$nin": ["cancelled"]}
    return orders.count_documents(query) > 0


def _customer_coupon_uses(tenant_id: str, user_id: str, code: str) -> int:
    """Orders (not cancelled) in which this customer used the coupon."""
    query = cart_owner_query(tenant_id, user_id)
    query["couponCode"] = code
    query["orderStatus"] = {"$nin": ["cancelled"]}
    return orders.count_documents(query)


def _enforce_per_customer_limit(coupon: dict, tenant_id: str, user_id: str | None) -> None:
    limit = int(coupon.get("perCustomerLimit") or 0)
    if limit <= 0:
        return
    if not user_id:
        raise HTTPException(status_code=400, detail="Login is required to use this coupon.")
    if _customer_coupon_uses(tenant_id, user_id, coupon.get("code")) >= limit:
        raise HTTPException(
            status_code=400,
            detail=(
                "You have already used this coupon."
                if limit == 1
                else f"You have already used this coupon {limit} times."
            ),
        )


def _category_amount(coupon: dict, items: list[dict] | None) -> float:
    """Cart value from the coupon's category (REQ-085)."""
    category_id = str(coupon.get("categoryId") or "").strip()
    if not category_id:
        raise HTTPException(
            status_code=400,
            detail="This category coupon is not configured correctly.",
        )
    eligible = sum(
        float(item.get("subtotal") or 0)
        for item in items or []
        if str(item.get("categoryId") or "") == category_id
    )
    if eligible <= 0:
        raise HTTPException(
            status_code=400,
            detail="Add a product from the offer category to use this coupon.",
        )
    return round(eligible, 2)


def _eligible_amount(coupon: dict, subtotal: float, items: list[dict] | None) -> float:
    kind = offer_type_of(coupon)
    if kind == "category":
        return _category_amount(coupon, items)
    if kind != "product":
        return float(subtotal)
    product_id = str(coupon.get("productId") or "").strip()
    if not product_id:
        raise HTTPException(
            status_code=400,
            detail="This product coupon is not configured correctly.",
        )
    eligible = 0.0
    for item in items or []:
        if str(item.get("productId") or "") == product_id:
            eligible += float(item.get("subtotal") or 0)
    if eligible <= 0:
        raise HTTPException(
            status_code=400,
            detail="Add the offer product to your cart to use this coupon.",
        )
    return round(eligible, 2)


def calculate_discount(coupon: dict, amount: float) -> float:
    discount_value = float(coupon.get("discountValue", 0) or 0)
    if coupon.get("discountType") == "percentage":
        discount = amount * discount_value / 100
        maximum_discount = coupon.get("maximumDiscount")
        if maximum_discount:
            discount = min(discount, float(maximum_discount))
    else:
        discount = min(discount_value, amount)
    return round(max(discount, 0), 2)


def load_valid_coupon(tenant_id: str, coupon_code: str) -> dict:
    coupon = coupons.find_one(
        {
            "tenantId": tenant_id_query(tenant_id),
            "code": coupon_code,
            "isActive": True,
        }
    )
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon.")
    _require_dates(coupon, datetime.now(timezone.utc))
    usage_limit = coupon.get("usageLimit", 0) or 0
    used_count = coupon.get("usedCount", 0) or 0
    if usage_limit > 0 and used_count >= usage_limit:
        raise HTTPException(status_code=400, detail="Coupon usage limit exceeded.")
    return coupon


def apply_coupon_discount(
    tenant_id: str,
    coupon_code: str | None,
    subtotal: float,
    *,
    user_id: str | None = None,
    items: list[dict] | None = None,
) -> tuple[float, str | None]:
    if not coupon_code or not coupon_code.strip():
        return 0.0, None
    coupon = load_valid_coupon(tenant_id, coupon_code.strip().upper())
    kind = offer_type_of(coupon)
    if kind == "first_order":
        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="Login is required to use a first-order coupon.",
            )
        if _customer_has_prior_order(tenant_id, user_id):
            raise HTTPException(
                status_code=400,
                detail="This coupon is only valid on your first order.",
            )
    _enforce_per_customer_limit(coupon, tenant_id, user_id)
    eligible = _eligible_amount(coupon, subtotal, items)
    minimum_order_amount = float(coupon.get("minimumOrderAmount", 0) or 0)
    if eligible < minimum_order_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum order amount is ₹{minimum_order_amount}",
        )
    return calculate_discount(coupon, eligible), coupon.get("code")


def active_festival_offers(tenant_id: str, limit: int = 3) -> list[dict]:
    now = datetime.now(timezone.utc)
    cursor = (
        coupons.find(
            {
                "tenantId": tenant_id_query(tenant_id),
                "isActive": True,
                "offerType": "festival",
            }
        )
        .sort("endDate", 1)
        .limit(20)
    )
    offers: list[dict] = []
    for coupon in cursor:
        try:
            _require_dates(coupon, now)
        except HTTPException:
            continue
        message = str(coupon.get("festivalMessage") or "").strip()
        if not message:
            continue
        offers.append(
            {
                "code": coupon.get("code"),
                "title": str(coupon.get("festivalTitle") or "").strip()
                or "Festival offer",
                "message": message,
                "discountType": coupon.get("discountType"),
                "discountValue": coupon.get("discountValue"),
            }
        )
        if len(offers) >= limit:
            break
    return offers


def build_coupon_document(
    tenant_id: str,
    payload: dict,
    *,
    existing: dict | None = None,
) -> dict:
    code = str(payload.get("code") or (existing or {}).get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Coupon code is required.")
    kind = offer_type_of(payload if payload.get("offerType") else existing)
    if payload.get("offerType"):
        kind = offer_type_of(payload)
    product_id = str(payload.get("productId") or "").strip() or None
    if kind == "product":
        if not product_id:
            raise HTTPException(
                status_code=400,
                detail="Select a product for this coupon.",
            )
        if not find_active_product(product_id, tenant_id):
            raise HTTPException(
                status_code=400,
                detail="Selected product was not found.",
            )
    else:
        product_id = None
    category_id = str(payload.get("categoryId") or "").strip() or None
    if kind == "category":
        if not category_id:
            raise HTTPException(status_code=400, detail="Select a category for this coupon.")
        # Only existing categories: some product in this store must use it.
        if not products.find_one(
            {"tenantId": tenant_id_query(tenant_id), "categoryId": category_id}, {"_id": 1}
        ):
            raise HTTPException(status_code=400, detail="Selected category was not found in this store.")
    else:
        category_id = None
    festival_title = str(payload.get("festivalTitle") or "").strip()
    festival_message = str(payload.get("festivalMessage") or "").strip()
    if kind == "festival" and not festival_message:
        raise HTTPException(
            status_code=400,
            detail="Add a festival message to show on the storefront.",
        )
    if kind != "festival":
        festival_title = ""
        festival_message = ""
    start = payload.get("startDate")
    end = payload.get("endDate")
    if start and end and end <= start:
        raise HTTPException(
            status_code=400,
            detail="End date must be after start date.",
        )
    return {
        "tenantId": tenant_id,
        "code": code,
        "description": str(payload.get("description") or "").strip(),
        "discountType": payload.get("discountType") or "percentage",
        "discountValue": float(payload.get("discountValue") or 0),
        "minimumOrderAmount": float(payload.get("minimumOrderAmount") or 0),
        "maximumDiscount": float(payload.get("maximumDiscount") or 0),
        "usageLimit": int(payload.get("usageLimit") or 0),
        "perCustomerLimit": int(payload.get("perCustomerLimit") or 0),
        "offerType": kind,
        "productId": product_id,
        "categoryId": category_id,
        "festivalTitle": festival_title,
        "festivalMessage": festival_message,
        "startDate": start,
        "endDate": end,
        "isActive": bool(payload.get("isActive", True)),
    }
