from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId
from datetime import datetime
from app.database.mongo import (
    carts,
    products,
    orders,
    coupons,
)
from app.models.payment import (
    CreatePaymentOrder,
    VerifyPayment,
)
from app.services.checkout_service import (
    calculate_checkout,
)
from app.utils.razorpay_client import client
router = APIRouter(
    prefix="/payments",
    tags=["Payments"],
)
# ============================================================
# TEST RAZORPAY CONNECTION
# ============================================================
@router.get("/test-razorpay")
def test_razorpay():
    try:
        # ₹100 = 10000 paise
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
        print("====================================")
        print("RAZORPAY TEST ERROR")
        print(type(e).__name__)
        print(str(e))
        print("====================================")
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )
# ============================================================
# CREATE RAZORPAY ORDER
# ============================================================
@router.post("/create-order")
def create_order(
    request: CreatePaymentOrder,
):
    try:
        # ----------------------------------------------------
        # Calculate checkout
        # ----------------------------------------------------
        checkout_data = calculate_checkout(
            tenant_id=request.tenantId,
            user_id=request.userId,
            coupon_code=request.couponCode,
        )
        grand_total = checkout_data["grandTotal"]
        # ----------------------------------------------------
        # Convert INR to paise
        # ----------------------------------------------------
        amount_in_paise = int(round(grand_total * 100))
        print("================================")
        print("TENANT:", request.tenantId)
        print("USER:", request.userId)
        print("CHECKOUT DATA:", checkout_data)
        print("GRAND TOTAL:", grand_total)
        print("AMOUNT IN PAISE:", amount_in_paise)
        print("================================")
        if amount_in_paise <= 0:
            raise HTTPException(
                status_code=400,
                detail="Amount must be greater than zero.",
            )
        # ----------------------------------------------------
        # Create Razorpay order
        # ----------------------------------------------------
        razorpay_order = client.order.create(
            {
                "amount": amount_in_paise,
                "currency": "INR",
                "payment_capture": 1,
                "notes": {
                    "tenantId": request.tenantId,
                    "userId": request.userId,
                },
            }
        )
        # ----------------------------------------------------
        # Return response
        # ----------------------------------------------------
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
    except Exception as e:
        print("====================================")
        print("CREATE PAYMENT ORDER ERROR")
        print(type(e).__name__)
        print(str(e))
        print("====================================")
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
# ============================================================
# VERIFY PAYMENT
# ============================================================
@router.post("/verify")
def verify_payment(
    request: VerifyPayment,
):
    try:
        # ----------------------------------------------------
        # 1. Verify Razorpay signature
        # ----------------------------------------------------
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": request.razorpayOrderId,
                "razorpay_payment_id": request.razorpayPaymentId,
                "razorpay_signature": request.razorpaySignature,
            }
        )
        # ----------------------------------------------------
        # 2. Fetch Razorpay order
        # ----------------------------------------------------
        razorpay_order = client.order.fetch(request.razorpayOrderId)
        notes = razorpay_order.get("notes", {})
        # ----------------------------------------------------
        # 3. Verify tenant
        # ----------------------------------------------------
        if notes.get("tenantId") != request.tenantId:
            raise HTTPException(
                status_code=400,
                detail="Tenant mismatch.",
            )
        # ----------------------------------------------------
        # 4. Verify user
        # ----------------------------------------------------
        if notes.get("userId") != request.userId:
            raise HTTPException(
                status_code=400,
                detail="User mismatch.",
            )
        # ----------------------------------------------------
        # 5. Fetch Razorpay payment
        # ----------------------------------------------------
        payment = client.payment.fetch(request.razorpayPaymentId)
        # ----------------------------------------------------
        # 6. Verify payment belongs to order
        # ----------------------------------------------------
        if payment.get("order_id") != request.razorpayOrderId:
            raise HTTPException(
                status_code=400,
                detail="Payment does not belong to this order.",
            )
        # ----------------------------------------------------
        # 7. Verify payment captured
        # ----------------------------------------------------
        if payment.get("status") != "captured":
            raise HTTPException(
                status_code=400,
                detail="Payment has not been captured.",
            )
        # ----------------------------------------------------
        # 8. Prevent duplicate order
        # ----------------------------------------------------
        existing_order = orders.find_one(
            {
                "tenantId": request.tenantId,
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
        # ----------------------------------------------------
        # 9. Calculate checkout again
        # ----------------------------------------------------
        #
        # NOTE:
        # This is okay for our current testing stage.
        #
        # Later we should store a checkout snapshot
        # when creating the Razorpay order.
        #
        checkout_data = calculate_checkout(
            tenant_id=request.tenantId,
            user_id=request.userId,
            coupon_code=None,
        )
        calculated_amount = checkout_data["grandTotal"]
        # ----------------------------------------------------
        # 10. Verify Razorpay amount
        # ----------------------------------------------------
        razorpay_amount = razorpay_order["amount"] / 100
        if round(razorpay_amount, 2) != round(
            calculated_amount,
            2,
        ):
            raise HTTPException(
                status_code=400,
                detail=("Payment amount does not " "match checkout amount."),
            )
        # ----------------------------------------------------
        # 11. Validate MongoDB ObjectIds
        # ----------------------------------------------------
        try:
            user_object_id = ObjectId(request.userId)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid user ID.",
            )
        # ----------------------------------------------------
        # 12. Build order items
        # ----------------------------------------------------
        order_items = []
        for item in checkout_data["items"]:
            try:
                product_object_id = ObjectId(item["productId"])
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail=("Invalid product ID: " f"{item['productId']}"),
                )
            order_items.append(
                {
                    "productId": product_object_id,
                    "name": item["name"],
                    "price": item["price"],
                    "quantity": item["quantity"],
                    "subtotal": item["subtotal"],
                    "image": item.get("image"),
                }
            )
        now = datetime.utcnow()
        # ----------------------------------------------------
        # 13. Create order document
        # ----------------------------------------------------
        order_document = {
            "tenantId": request.tenantId,
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
        # ----------------------------------------------------
        # 14. Insert order
        # ----------------------------------------------------
        result = orders.insert_one(order_document)
        # ----------------------------------------------------
        # 15. Reduce product stock
        # ----------------------------------------------------
        for item in order_items:
            stock_result = products.update_one(
                {
                    "_id": item["productId"],
                    "tenantId": request.tenantId,
                    "stock": {"$gte": item["quantity"]},
                },
                {
                    "$inc": {"stock": -item["quantity"]},
                    "$set": {"updatedAt": now},
                },
            )
            # Stock changed / insufficient stock
            if stock_result.modified_count == 0:
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
                    detail=("Stock changed while " "processing the order."),
                )
        # ----------------------------------------------------
        # 16. Update coupon usage
        # ----------------------------------------------------
        coupon_code = checkout_data["couponCode"]
        if coupon_code:
            coupons.update_one(
                {
                    "tenantId": request.tenantId,
                    "code": coupon_code,
                    "isActive": True,
                },
                {
                    "$inc": {"usedCount": 1},
                    "$set": {"updatedAt": now},
                },
            )
        # ----------------------------------------------------
        # 17. Clear cart
        # ----------------------------------------------------
        carts.delete_many(
            {
                "tenantId": request.tenantId,
                "userId": user_object_id,
            }
        )
        # ----------------------------------------------------
        # 18. Return success
        # ----------------------------------------------------
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
        print("====================================")
        print("PAYMENT VERIFICATION ERROR")
        print(type(e).__name__)
        print(str(e))
        print("====================================")
        raise HTTPException(
            status_code=400,
            detail="Payment verification failed.",
        )
# ============================================================
# GET PAYMENTS FOR RAZORPAY ORDER
# ============================================================
@router.get("/order/{order_id}")
def get_payment_status(
    order_id: str,
):
    try:
        payments = client.order.fetch_payments(order_id)
        items = payments.get("items", [])
        # ----------------------------------------------------
        # No payment
        # ----------------------------------------------------
        if not items:
            return {
                "success": True,
                "orderId": order_id,
                "status": "pending",
                "payment": None,
            }
        # ----------------------------------------------------
        # Latest payment
        # ----------------------------------------------------
        payment = items[0]
        return {
            "success": True,
            "orderId": order_id,
            "paymentId": payment.get("id"),
            "status": payment.get("status"),
            "amount": payment.get("amount", 0) / 100,
            "method": payment.get("method"),
            "email": payment.get("email"),
            "contact": payment.get("contact"),
            "createdAt": payment.get("created_at"),
        }
    except Exception as e:
        print("Get payment status error:", str(e))
        raise HTTPException(
            status_code=400,
            detail="Unable to fetch payment status.",
        )
# ============================================================
# GET PAYMENT DETAILS
# ============================================================
@router.get("/payment/{payment_id}")
def get_payment(
    payment_id: str,
):
    try:
        payment_data = client.payment.fetch(payment_id)
        return {
            "success": True,
            "payment": payment_data,
        }
    except Exception as e:
        print("Get payment error:", str(e))
        raise HTTPException(
            status_code=400,
            detail="Unable to fetch payment.",
        )
# ============================================================
# REFUND PAYMENT
# ============================================================
@router.post("/refund/{payment_id}")
def refund(
    payment_id: str,
):
    try:
        refund_data = client.payment.refund(payment_id)
        return {
            "success": True,
            "message": "Refund initiated successfully.",
            "refund": refund_data,
        }
    except Exception as e:
        print("Refund error:", str(e))
        raise HTTPException(
            status_code=400,
            detail="Refund failed.",
        )
# ============================================================
# WEBHOOK
# ============================================================
#
# Webhook verification is intentionally disabled for now.
# We will configure RAZORPAY_WEBHOOK_SECRET later.
#
# ============================================================
@router.post("/webhook")
async def webhook(
    request: Request,
):
    return {
        "success": True,
        "status": "webhook setup pending",
    }
