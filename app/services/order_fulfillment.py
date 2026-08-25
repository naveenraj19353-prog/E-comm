from datetime import datetime, timedelta
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
    stale_before = datetime.utcnow() - timedelta(
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
                "processingAt": datetime.utcnow(),
            }
        },
    )


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
        payment_intents.update_one(
            {"_id": claimed["_id"]},
            {"$set": {"status": "fulfilled", "updatedAt": datetime.utcnow()}},
        )
        return _order_response(existing, razorpay_payment_id)

    checkout_data = claimed.get("checkout") or {}
    if not checkout_data.get("address"):
        _refund_payment(razorpay_payment_id)
        payment_intents.update_one(
            {"_id": claimed["_id"]},
            {
                "$set": {
                    "status": "refunded",
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        raise HTTPException(
            status_code=400,
            detail="A delivery address is required. Payment was refunded.",
        )

    try:
        order_items = _build_order_items(checkout_data)
    except HTTPException:
        _refund_payment(razorpay_payment_id)
        payment_intents.update_one(
            {"_id": claimed["_id"]},
            {
                "$set": {
                    "status": "refunded",
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        raise
    now = datetime.utcnow()
    reserved = []
    if not claimed.get("stockReserved"):
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
                _refund_payment(razorpay_payment_id)
                payment_intents.update_one(
                    {"_id": claimed["_id"]},
                    {
                        "$set": {
                            "status": "refunded",
                            "updatedAt": now,
                        }
                    },
                )
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "An item went out of stock. "
                        "The payment has been refunded."
                    ),
                )
            reserved.append(item)
        payment_intents.update_one(
            {"_id": claimed["_id"]},
            {"$set": {"stockReserved": True, "updatedAt": now}},
        )

    user_object_id = ObjectId(str(claimed["userId"]))
    order_document = {
        "tenantId": claimed["tenantId"],
        "userId": user_object_id,
        "razorpayOrderId": razorpay_order_id,
        "razorpayPaymentId": razorpay_payment_id,
        "items": order_items,
        "subtotal": checkout_data["subtotal"],
        "discount": checkout_data["discount"],
        "shipping": checkout_data["shipping"],
        "tax": checkout_data["tax"],
        "totalAmount": checkout_data["grandTotal"],
        "couponCode": checkout_data.get("couponCode"),
        "address": checkout_data["address"],
        "paymentStatus": "paid",
        "orderStatus": "confirmed",
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        result = orders.insert_one(order_document)
        order_document["_id"] = result.inserted_id
    except DuplicateKeyError:
        existing = _find_order(razorpay_order_id)
        if existing:
            return _order_response(existing, razorpay_payment_id)
        raise HTTPException(
            status_code=409,
            detail="Order could not be created. Please contact support.",
        )

    coupon_code = checkout_data.get("couponCode")
    if coupon_code:
        coupons.update_one(
            {
                "tenantId": tenant_id_query(claimed["tenantId"]),
                "code": coupon_code,
                "isActive": True,
            },
            {
                "$inc": {"usedCount": 1},
                "$set": {"updatedAt": now},
            },
        )
    carts.delete_many(
        cart_owner_query(claimed["tenantId"], str(claimed["userId"]))
    )
    payment_intents.update_one(
        {"_id": claimed["_id"]},
        {
            "$set": {
                "status": "fulfilled",
                "razorpayPaymentId": razorpay_payment_id,
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    return _order_response(order_document, razorpay_payment_id)
