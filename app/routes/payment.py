from fastapi import APIRouter, Depends, HTTPException, Request
from bson import ObjectId
from datetime import datetime
from requests.exceptions import SSLError, ConnectionError as RequestsConnectionError
from app.database.mongo import (
    carts,
    products,
    orders,
    coupons,
    payment_intents,
)
from app.models.payment import (
    CreatePaymentOrder,
    VerifyPayment,
)
from app.services.checkout_service import calculate_checkout
from app.utils.razorpay_client import client
from app.utils.auth_dependencies import (
    customer_scope,
    require_admin,
    require_customer,
    require_super_admin,
)

router = APIRouter(
    prefix="/payments",
    tags=["Payments"],
)


def decrement_variant_stock(
    product_id: ObjectId,
    tenant_id: str,
    variant_id: str,
    quantity: int,
    now: datetime,
) -> bool:
    result = products.update_one(
        {
            "_id": product_id,
            "tenantId": tenant_id,
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
    return True


@router.get("/test-razorpay")
def test_razorpay(current_user: dict = Depends(require_super_admin)):
    try:
        order = client.order.create(
            {
                "amount": 10000,
                "currency": "INR",
                "payment_capture": 1,
            }
        )
        return {
            "success": True,
            "message": "Razorpay connection successful.",
            "orderId": order["id"],
            "amount": order["amount"] / 100,
            "currency": order["currency"],
            "status": order["status"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/create-order")
def create_order(
    request: CreatePaymentOrder,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    try:
        checkout_data = calculate_checkout(
            tenant_id=tenant_id,
            user_id=user_id,
            coupon_code=request.couponCode,
        )
        grand_total = checkout_data["grandTotal"]
        amount_in_paise = int(round(grand_total * 100))
        if amount_in_paise <= 0:
            raise HTTPException(
                status_code=400,
                detail="Amount must be greater than zero.",
            )
        razorpay_order = client.order.create(
            {
                "amount": amount_in_paise,
                "currency": "INR",
                "payment_capture": 1,
                "notes": {
                    "tenantId": tenant_id,
                    "userId": user_id,
                },
            }
        )
        payment_intents.insert_one(
            {
                "razorpayOrderId": razorpay_order["id"],
                "tenantId": tenant_id,
                "userId": user_id,
                "couponCode": checkout_data.get("couponCode"),
                "grandTotal": grand_total,
                "checkout": checkout_data,
                "createdAt": datetime.utcnow(),
            }
        )
        return {
            "success": True,
            "message": "Payment order created successfully.",
            "orderId": razorpay_order["id"],
            "amount": grand_total,
            "amountInPaise": amount_in_paise,
            "currency": razorpay_order["currency"],
            "status": razorpay_order["status"],
        }
    except HTTPException:
        raise
    except SSLError as e:
        print("CREATE PAYMENT ORDER ERROR", str(e))
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not reach Razorpay because of an SSL "
                "certificate error on this machine."
            ),
        )
    except RequestsConnectionError as e:
        print("CREATE PAYMENT ORDER ERROR", str(e))
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Razorpay. Please try again.",
        )
    except Exception as e:
        print("CREATE PAYMENT ORDER ERROR", str(e))
        detail = str(e).strip() or "Unable to create payment order."
        if "certificate" in detail.lower() or "ssl" in detail.lower():
            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not reach Razorpay because of an SSL "
                    "certificate error on this machine."
                ),
            )
        raise HTTPException(status_code=500, detail=detail)


@router.post("/verify")
def verify_payment(
    request: VerifyPayment,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": request.razorpayOrderId,
                "razorpay_payment_id": request.razorpayPaymentId,
                "razorpay_signature": request.razorpaySignature,
            }
        )
        razorpay_order = client.order.fetch(request.razorpayOrderId)
        notes = razorpay_order.get("notes", {})
        if notes.get("tenantId") != tenant_id:
            raise HTTPException(status_code=400, detail="Tenant mismatch.")
        if notes.get("userId") != user_id:
            raise HTTPException(status_code=400, detail="User mismatch.")
        payment = client.payment.fetch(request.razorpayPaymentId)
        if payment.get("order_id") != request.razorpayOrderId:
            raise HTTPException(
                status_code=400,
                detail="Payment does not belong to this order.",
            )
        if payment.get("status") != "captured":
            raise HTTPException(
                status_code=400,
                detail="Payment has not been captured.",
            )
        existing_order = orders.find_one(
            {
                "tenantId": tenant_id,
                "razorpayOrderId": request.razorpayOrderId,
            }
        )
        if existing_order:
            return {
                "success": True,
                "message": "Order already processed.",
                "orderId": str(existing_order["_id"]),
                "paymentId": request.razorpayPaymentId,
            }
        intent = payment_intents.find_one(
            {
                "razorpayOrderId": request.razorpayOrderId,
                "tenantId": tenant_id,
                "userId": user_id,
            }
        )
        if not intent:
            raise HTTPException(
                status_code=400,
                detail="Payment order was not found.",
            )
        checkout_data = intent["checkout"]
        calculated_amount = checkout_data["grandTotal"]
        razorpay_amount = razorpay_order["amount"] / 100
        if round(razorpay_amount, 2) != round(calculated_amount, 2):
            raise HTTPException(
                status_code=400,
                detail="Payment amount does not match checkout amount.",
            )
        user_object_id = ObjectId(user_id)
        order_items = []
        for item in checkout_data["items"]:
            order_items.append(
                {
                    "productId": ObjectId(item["productId"]),
                    "variantId": item.get("variantId"),
                    "name": item["name"],
                    "price": item["price"],
                    "quantity": item["quantity"],
                    "subtotal": item["subtotal"],
                    "image": item.get("image"),
                    "color": item.get("color"),
                    "size": item.get("size"),
                }
            )
        now = datetime.utcnow()
        order_document = {
            "tenantId": tenant_id,
            "userId": user_object_id,
            "razorpayOrderId": request.razorpayOrderId,
            "razorpayPaymentId": request.razorpayPaymentId,
            "items": order_items,
            "subtotal": checkout_data["subtotal"],
            "discount": checkout_data["discount"],
            "shipping": checkout_data["shipping"],
            "tax": checkout_data["tax"],
            "totalAmount": checkout_data["grandTotal"],
            "couponCode": checkout_data["couponCode"],
            "address": checkout_data["address"],
            "paymentStatus": "paid",
            "orderStatus": "confirmed",
            "createdAt": now,
            "updatedAt": now,
        }
        result = orders.insert_one(order_document)
        for item in order_items:
            variant_id = item.get("variantId")
            if not variant_id:
                orders.update_one(
                    {"_id": result.inserted_id},
                    {
                        "$set": {
                            "orderStatus": "stock_issue",
                            "updatedAt": datetime.utcnow(),
                        }
                    },
                )
                raise HTTPException(
                    status_code=409,
                    detail="Stock changed while processing the order.",
                )
            stock_ok = decrement_variant_stock(
                item["productId"],
                tenant_id,
                variant_id,
                item["quantity"],
                now,
            )
            if not stock_ok:
                orders.update_one(
                    {"_id": result.inserted_id},
                    {
                        "$set": {
                            "orderStatus": "stock_issue",
                            "updatedAt": datetime.utcnow(),
                        }
                    },
                )
                raise HTTPException(
                    status_code=409,
                    detail="Stock changed while processing the order.",
                )
        coupon_code = checkout_data.get("couponCode")
        if coupon_code:
            coupons.update_one(
                {
                    "tenantId": tenant_id,
                    "code": coupon_code,
                    "isActive": True,
                },
                {
                    "$inc": {"usedCount": 1},
                    "$set": {"updatedAt": now},
                },
            )
        carts.delete_many(
            {
                "tenantId": tenant_id,
                "userId": user_object_id,
            }
        )
        return {
            "success": True,
            "message": "Payment verified and order created successfully.",
            "orderId": str(result.inserted_id),
            "razorpayOrderId": request.razorpayOrderId,
            "paymentId": request.razorpayPaymentId,
            "amount": checkout_data["grandTotal"],
            "paymentStatus": "paid",
            "orderStatus": "confirmed",
        }
    except HTTPException:
        raise
    except Exception as e:
        print("PAYMENT VERIFICATION ERROR", str(e))
        raise HTTPException(
            status_code=400,
            detail="Payment verification failed.",
        )


@router.get("/order/{order_id}")
def get_payment_status(
    order_id: str,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    intent = payment_intents.find_one(
        {
            "razorpayOrderId": order_id,
            "tenantId": tenant_id,
            "userId": user_id,
        }
    )
    if not intent:
        raise HTTPException(status_code=404, detail="Payment order not found.")
    try:
        payments = client.order.fetch_payments(order_id)
        items = payments.get("items", [])
        if not items:
            return {
                "success": True,
                "orderId": order_id,
                "status": "pending",
                "payment": None,
            }
        payment = items[0]
        return {
            "success": True,
            "orderId": order_id,
            "paymentId": payment.get("id"),
            "status": payment.get("status"),
            "amount": payment.get("amount", 0) / 100,
            "method": payment.get("method"),
            "createdAt": payment.get("created_at"),
        }
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Unable to fetch payment status.",
        )


@router.get("/payment/{payment_id}")
def get_payment(
    payment_id: str,
    current_user: dict = Depends(require_admin),
):
    try:
        payment_data = client.payment.fetch(payment_id)
        return {
            "success": True,
            "payment": {
                "id": payment_data.get("id"),
                "status": payment_data.get("status"),
                "amount": payment_data.get("amount", 0) / 100,
                "method": payment_data.get("method"),
            },
        }
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Unable to fetch payment.",
        )


@router.post("/refund/{payment_id}")
def refund(
    payment_id: str,
    current_user: dict = Depends(require_admin),
):
    try:
        refund_data = client.payment.refund(payment_id)
        return {
            "success": True,
            "message": "Refund initiated successfully.",
            "refundId": refund_data.get("id"),
            "status": refund_data.get("status"),
        }
    except Exception:
        raise HTTPException(status_code=400, detail="Refund failed.")


@router.post("/webhook")
async def webhook(request: Request):
    return {
        "success": True,
        "status": "webhook setup pending",
    }
