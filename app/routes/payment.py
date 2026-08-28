import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from requests.exceptions import SSLError, ConnectionError as RequestsConnectionError

from app.config import RAZORPAY_WEBHOOK_SECRET
from app.database.mongo import payment_intents
from app.models.payment import (
    CreatePaymentOrder,
    VerifyPayment,
)
from app.services.checkout_service import calculate_checkout
from app.services.order_fulfillment import fulfill_captured_payment
from app.services.payment_validation import validate_captured_payment
from app.utils.razorpay_client import client
from app.utils.auth_dependencies import (
    customer_scope,
    require_admin,
    require_customer,
    require_super_admin,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/payments",
    tags=["Payments"],
)


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
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Unable to connect to Razorpay.",
        )


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
            address_id=request.addressId,
            require_address=True,
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
                "addressId": request.addressId,
                "couponCode": checkout_data.get("couponCode"),
                "grandTotal": grand_total,
                "checkout": checkout_data,
                "status": "pending",
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
    except SSLError:
        logger.exception("Razorpay SSL error while creating payment order")
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not reach Razorpay because of an SSL "
                "certificate error on this machine."
            ),
        )
    except RequestsConnectionError:
        logger.exception("Razorpay connection error while creating payment order")
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Razorpay. Please try again.",
        )
    except Exception as error:
        logger.exception("Unexpected error while creating payment order")
        detail = str(error).strip() or "Unable to create payment order."
        if "certificate" in detail.lower() or "ssl" in detail.lower():
            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not reach Razorpay because of an SSL "
                    "certificate error on this machine."
                ),
            )
        raise HTTPException(status_code=500, detail="Unable to create payment order.")


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
        validate_captured_payment(
            request.razorpayOrderId,
            request.razorpayPaymentId,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        return fulfill_captured_payment(
            request.razorpayOrderId,
            request.razorpayPaymentId,
            tenant_id=tenant_id,
            user_id=user_id,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Payment verification failed")
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
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Webhook secret is not configured.",
        )

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing webhook signature.")

    try:
        client.utility.verify_webhook_signature(
            body.decode("utf-8"),
            signature,
            RAZORPAY_WEBHOOK_SECRET,
        )
    except Exception:
        logger.exception("Invalid Razorpay webhook signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event = payload.get("event")
    if event != "payment.captured":
        return {"success": True, "status": "ignored", "event": event}

    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    razorpay_order_id = payment_entity.get("order_id")
    razorpay_payment_id = payment_entity.get("id")
    if not razorpay_order_id or not razorpay_payment_id:
        return {"success": True, "status": "ignored", "reason": "missing ids"}

    if payment_entity.get("status") != "captured":
        return {"success": True, "status": "ignored", "reason": "not captured"}

    try:
        validate_captured_payment(razorpay_order_id, razorpay_payment_id)
        result = fulfill_captured_payment(
            razorpay_order_id,
            razorpay_payment_id,
        )
        return {"success": True, "status": "fulfilled", "orderId": result.get("orderId")}
    except HTTPException as error:
        if error.status_code == 409 and "still being processed" in str(error.detail):
            return {"success": True, "status": "processing"}
        if error.status_code in {400, 409}:
            logger.warning(
                "Webhook fulfillment handled with status %s: %s",
                error.status_code,
                error.detail,
            )
            return {
                "success": True,
                "status": "handled",
                "detail": error.detail,
            }
        raise
    except Exception:
        logger.exception("Webhook fulfillment failed")
        raise HTTPException(status_code=500, detail="Webhook processing failed.")
