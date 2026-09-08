from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from app.database.mongo import (
    carts,
    products,
    orders,
    coupons,
    payment_intents,
)
from app.services.checkout_service import (
    cart_owner_query,
    tenant_id_query,
    calculate_checkout,
)
from app.utils.razorpay_client import client


PROCESSING_STALE_MINUTES = 2


def _refresh_total_stock(product_id: ObjectId, now: datetime) -> None:
    product = products.find_one({"_id": product_id}, {"inventory": 1})
    total = 0
    for item in (product or {}).get("inventory") or []:
        try:
            total += int(item.get("stock", 0) or 0)
        except (TypeError, ValueError):
            continue
    products.update_one(
        {"_id": product_id},
        {"$set": {"totalStock": total, "updatedAt": now}},
    )


def decrement_variant_stock(
    product_id: ObjectId,
    variant_id: str,
    quantity: int,
    now: datetime,
) -> bool:
    result = products.update_one(
        {
            "_id": product_id,
            "inventory": {
                "$elemMatch": {
                    "variantId": str(variant_id),
                    "stock": {"$gte": quantity},
                }
            },
        },
        {
            "$inc": {"inventory.$.stock": -quantity},
            "$set": {"updatedAt": now},
        },
    )
    if result.modified_count == 0:
        return False
    _refresh_total_stock(product_id, now)
    return True


def restore_variant_stock(
    product_id: ObjectId,
    variant_id: str,
    quantity: int,
    now: datetime,
) -> None:
    products.update_one(
        {
            "_id": product_id,
            "inventory.variantId": str(variant_id),
        },
        {
            "$inc": {"inventory.$.stock": quantity},
            "$set": {"updatedAt": now},
        },
    )
    _refresh_total_stock(product_id, now)


def _order_response(order: dict, payment_id: str) -> dict:
    return {
        "success": True,
        "message": "Payment verified and order created successfully.",
        "orderId": str(order["_id"]),
        "razorpayOrderId": order.get("razorpayOrderId"),
        "paymentId": payment_id,
        "amount": order.get("totalAmount"),
        "paymentStatus": order.get("paymentStatus", "paid"),
        "orderStatus": order.get("orderStatus", "confirmed"),
    }


def _find_order(razorpay_order_id: str) -> dict | None:
    return orders.find_one({"razorpayOrderId": razorpay_order_id})


def _refund_payment(payment_id: str) -> None:
    try:
        client.payment.refund(payment_id)
    except Exception as error:
        print("PAYMENT REFUND ERROR", payment_id, str(error))


def _build_order_items(checkout_data: dict) -> list[dict]:
    order_items = []
    for item in checkout_data.get("items") or []:
        variant_id = item.get("variantId")
        if not variant_id:
            raise HTTPException(
                status_code=409,
                detail="Stock changed while processing the order.",
            )
        order_items.append(
            {
                "productId": ObjectId(item["productId"]),
                "variantId": str(variant_id),
                "name": item["name"],
                "price": item["price"],
                "quantity": item["quantity"],
                "subtotal": item["subtotal"],
                "image": item.get("image"),
                "color": item.get("color"),
                "size": item.get("size"),
            }
        )
    return order_items


def _claim_intent(razorpay_order_id: str):
    stale_before = datetime.now(timezone.utc) - timedelta(
        minutes=PROCESSING_STALE_MINUTES
    )
    return payment_intents.find_one_and_update(
        {
            "razorpayOrderId": razorpay_order_id,
            "$or": [
                {"status": {"$exists": False}},
                {"status": "pending"},
                {
                    "status": "processing",
                    "processingAt": {"$lt": stale_before},
                },
            ],
        },
        {
            "$set": {
                "status": "processing",
                "processingAt": datetime.now(timezone.utc),
            }
        },
    )


def _reserve_stock(order_items: list[dict], now: datetime) -> bool:
    reserved = []
    for item in order_items:
        stock_ok = decrement_variant_stock(
            item["productId"],
            item["variantId"],
            item["quantity"],
            now,
        )
        if not stock_ok:
            for reserved_item in reserved:
                restore_variant_stock(
                    reserved_item["productId"],
                    reserved_item["variantId"],
                    reserved_item["quantity"],
                    now,
                )
            return False
        reserved.append(item)
    return True


def _build_order_document(
    checkout_data: dict,
    tenant_id: str,
    user_id,
    order_items: list[dict],
    now: datetime,
    *,
    payment_method: str,
    payment_status: str,
    razorpay_order_id: str | None = None,
    razorpay_payment_id: str | None = None,
    payment_ids_first: bool = False,
) -> dict:
    order_document = {
        "tenantId": tenant_id,
        "userId": ObjectId(str(user_id)),
    }
    if payment_ids_first:
        order_document["razorpayOrderId"] = razorpay_order_id
        order_document["razorpayPaymentId"] = razorpay_payment_id
    order_document.update(
        {
            "items": order_items,
            "subtotal": checkout_data["subtotal"],
            "discount": checkout_data["discount"],
            "shipping": checkout_data["shipping"],
            "totalAmount": checkout_data["grandTotal"],
            "couponCode": checkout_data.get("couponCode"),
            "deliveryMethod": checkout_data.get("deliveryMethod", "standard"),
            "address": checkout_data["address"],
            "paymentMethod": payment_method,
            "paymentStatus": payment_status,
            "orderStatus": "confirmed",
            "createdAt": now,
            "updatedAt": now,
        }
    )
    if not payment_ids_first and razorpay_order_id:
        order_document["razorpayOrderId"] = razorpay_order_id
    if not payment_ids_first and razorpay_payment_id:
        order_document["razorpayPaymentId"] = razorpay_payment_id
    return order_document


def _insert_order(
    order_document: dict,
    razorpay_order_id: str | None = None,
    *,
    check_existing: bool = False,
) -> tuple[dict, bool]:
    try:
        result = orders.insert_one(order_document)
        order_document["_id"] = result.inserted_id
        return order_document, True
    except DuplicateKeyError:
        if check_existing:
            existing = _find_order(razorpay_order_id)
            if existing:
                return existing, False
        raise HTTPException(
            status_code=409,
            detail="Order could not be created. Please contact support.",
        )


def _apply_order_side_effects(
    checkout_data: dict,
    tenant_id: str,
    user_id,
    now: datetime,
) -> None:
    coupon_code = checkout_data.get("couponCode")
    if coupon_code:
        coupons.update_one(
            {
                "tenantId": tenant_id_query(tenant_id),
                "code": coupon_code,
                "isActive": True,
            },
            {
                "$inc": {"usedCount": 1},
                "$set": {"updatedAt": now},
            },
        )
    carts.delete_many(cart_owner_query(tenant_id, str(user_id)))


def _mark_intent_refunded(claimed: dict, now: datetime) -> None:
    payment_intents.update_one(
        {"_id": claimed["_id"]},
        {
            "$set": {
                "status": "refunded",
                "updatedAt": now,
            }
        },
    )


def _refund_claimed_payment(
    claimed: dict,
    razorpay_payment_id: str,
    now: datetime | None = None,
) -> None:
    _refund_payment(razorpay_payment_id)
    _mark_intent_refunded(claimed, now or datetime.now(timezone.utc))


def _validate_payment_intent(
    intent: dict | None,
    tenant_id: str | None,
    user_id: str | None,
) -> None:
    if not intent:
        raise HTTPException(
            status_code=400,
            detail="Payment order was not found.",
        )
    if tenant_id and intent.get("tenantId") != tenant_id:
        raise HTTPException(status_code=400, detail="Tenant mismatch.")
    if user_id and str(intent.get("userId")) != str(user_id):
        raise HTTPException(status_code=400, detail="User mismatch.")
    if intent.get("status") == "refunded":
        raise HTTPException(
            status_code=409,
            detail=(
                "Payment was refunded because an item "
                "went out of stock."
            ),
        )


def _prepare_paid_order_items(
    claimed: dict,
    checkout_data: dict,
    razorpay_payment_id: str,
) -> list[dict]:
    if not checkout_data.get("address"):
        _refund_claimed_payment(
            claimed,
            razorpay_payment_id,
        )
        raise HTTPException(
            status_code=400,
            detail="A delivery address is required. Payment was refunded.",
        )
    try:
        return _build_order_items(checkout_data)
    except HTTPException:
        _refund_claimed_payment(
            claimed,
            razorpay_payment_id,
        )
        raise


def _reserve_paid_order_stock(
    claimed: dict,
    order_items: list[dict],
    razorpay_payment_id: str,
    now: datetime,
) -> None:
    if claimed.get("stockReserved"):
        return
    if not _reserve_stock(order_items, now):
        _refund_claimed_payment(claimed, razorpay_payment_id, now)
        raise HTTPException(
            status_code=409,
            detail=(
                "An item went out of stock. "
                "The payment has been refunded."
            ),
        )
    payment_intents.update_one(
        {"_id": claimed["_id"]},
        {"$set": {"stockReserved": True, "updatedAt": now}},
    )


def _mark_intent_fulfilled(
    claimed: dict,
    extra_fields: dict | None = None,
) -> None:
    update = {"status": "fulfilled"}
    if extra_fields:
        update.update(extra_fields)
    update["updatedAt"] = datetime.now(timezone.utc)
    payment_intents.update_one(
        {"_id": claimed["_id"]},
        {"$set": update},
    )


def _finalize_order_from_checkout(
    checkout_data: dict,
    tenant_id: str,
    user_id: str,
    *,
    payment_method: str,
    payment_status: str,
    razorpay_order_id: str | None = None,
    razorpay_payment_id: str | None = None,
) -> dict:
    if not checkout_data.get("address"):
        raise HTTPException(
            status_code=400,
            detail="A delivery address is required.",
        )

    order_items = _build_order_items(checkout_data)
    now = datetime.now(timezone.utc)
    if not _reserve_stock(order_items, now):
        raise HTTPException(
            status_code=409,
            detail="An item went out of stock.",
        )

    order_document = _build_order_document(
        checkout_data,
        tenant_id,
        user_id,
        order_items,
        now,
        payment_method=payment_method,
        payment_status=payment_status,
        razorpay_order_id=razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
    )
    order_document, inserted = _insert_order(
        order_document,
        razorpay_order_id,
        check_existing=bool(razorpay_order_id),
    )
    if not inserted:
        return order_document

    _apply_order_side_effects(checkout_data, tenant_id, user_id, now)
    return order_document


def fulfill_cod_order(
    tenant_id: str,
    user_id: str,
    address_id: str,
    coupon_code: str | None = None,
    delivery_method: str = "standard",
) -> dict:
    checkout_data = calculate_checkout(
        tenant_id=tenant_id,
        user_id=user_id,
        coupon_code=coupon_code,
        address_id=address_id,
        require_address=True,
        delivery_method=delivery_method,
    )
    order = _finalize_order_from_checkout(
        checkout_data,
        tenant_id,
        user_id,
        payment_method="cod",
        payment_status="pending",
    )
    return {
        "success": True,
        "message": "Order placed successfully. Pay on delivery.",
        "orderId": str(order["_id"]),
        "amount": order.get("totalAmount"),
        "paymentStatus": order.get("paymentStatus", "pending"),
        "orderStatus": order.get("orderStatus", "confirmed"),
    }


def fulfill_captured_payment(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    tenant_id: str | None = None,
    user_id: str | None = None,
) -> dict:
    existing = _find_order(razorpay_order_id)
    if existing:
        return _order_response(existing, razorpay_payment_id)

    intent = payment_intents.find_one({"razorpayOrderId": razorpay_order_id})
    _validate_payment_intent(intent, tenant_id, user_id)

    claimed = _claim_intent(razorpay_order_id)
    if not claimed:
        existing = _find_order(razorpay_order_id)
        if existing:
            return _order_response(existing, razorpay_payment_id)
        raise HTTPException(
            status_code=409,
            detail="Payment is still being processed. Please wait.",
        )

    existing = _find_order(razorpay_order_id)
    if existing:
        _mark_intent_fulfilled(claimed)
        return _order_response(existing, razorpay_payment_id)

    checkout_data = claimed.get("checkout") or {}
    order_items = _prepare_paid_order_items(
        claimed,
        checkout_data,
        razorpay_payment_id,
    )

    now = datetime.now(timezone.utc)
    _reserve_paid_order_stock(
        claimed,
        order_items,
        razorpay_payment_id,
        now,
    )

    order_document = _build_order_document(
        checkout_data,
        claimed["tenantId"],
        claimed["userId"],
        order_items,
        now,
        payment_method="razorpay",
        payment_status="paid",
        razorpay_order_id=razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        payment_ids_first=True,
    )
    order_document, inserted = _insert_order(
        order_document,
        razorpay_order_id,
        check_existing=True,
    )
    if not inserted:
        return _order_response(order_document, razorpay_payment_id)

    _apply_order_side_effects(
        checkout_data,
        claimed["tenantId"],
        claimed["userId"],
        now,
    )
    _mark_intent_fulfilled(
        claimed,
        {"razorpayPaymentId": razorpay_payment_id},
    )
    return _order_response(order_document, razorpay_payment_id)
