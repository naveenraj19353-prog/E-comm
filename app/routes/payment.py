import json
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import SSLError

from app.config import RAZORPAY_WEBHOOK_SECRET
from app.database.mongo import orders, payment_intents
from app.observability import alert
from app.models.payment import (
    CreatePaymentOrder,
    RefundPaymentRequest,
    VerifyPayment,
)
from app.routes.response_metadata import (
    BAD_GATEWAY_RESPONSE,
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
    SERVICE_UNAVAILABLE_RESPONSE,
)
from app.services.billing_service import handle_subscription_event
from app.services.checkout_service import calculate_checkout
from app.services.ledger_service import record_order_refund, record_partial_refund
from app.services.order_fulfillment import (
    expire_abandoned_payment_intents,
    fulfill_captured_payment,
    release_reserved_stock,
    reserve_checkout_stock,
)
from app.services.payment_validation import validate_captured_payment
from app.services.whatsapp_notification_service import (
    send_order_confirmation,
    send_payment_success,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    customer_scope,
    require_customer,
    require_permission,
    require_super_admin,
)
from app.utils.razorpay_client import client

logger = logging.getLogger(__name__)
RAZORPAY_SSL_ERROR_DETAIL = "Could not reach Razorpay because of an SSL certificate error on this machine."

router = APIRouter(
    prefix="/payments",
    tags=["Payments"],
)


@router.get("/test-razorpay", responses={400: BAD_REQUEST_RESPONSE[400]})
def test_razorpay(
    current_user: Annotated[dict, Depends(require_super_admin)],
):
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


@router.post(
    "/create-order",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
        502: BAD_GATEWAY_RESPONSE[502],
    },
)
def create_order(
    request: CreatePaymentOrder,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, user_id = customer_scope(current_user)
    try:
        checkout_data = calculate_checkout(
            tenant_id=tenant_id,
            user_id=user_id,
            coupon_code=request.couponCode,
            address_id=request.addressId,
            require_address=True,
            delivery_method=request.deliveryMethod,
            enforce_store_availability=True,
        )
        grand_total = checkout_data["grandTotal"]
        amount_in_paise = int(round(grand_total * 100))
        if amount_in_paise < 100:
            raise HTTPException(
                status_code=400,
                detail="Order amount must be at least ₹1.00 (100 paise).",
            )

        try:
            expire_abandoned_payment_intents()
        except Exception:
            logger.exception("Abandoned payment intent sweep failed")

        # Hold stock now, before the customer pays, so a second customer
        # can't also pay for the last unit only to be auto-refunded later.
        reserved_items = reserve_checkout_stock(checkout_data)
        try:
            razorpay_order = client.order.create(
                {
                    "amount": amount_in_paise,
                    "currency": "INR",
                    "receipt": f"rcpt_{tenant_id[:12]}_{user_id[-8:]}",
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
                    "deliveryMethod": checkout_data.get("deliveryMethod", "standard"),
                    "grandTotal": grand_total,
                    "checkout": checkout_data,
                    "status": "pending",
                    "stockReserved": True,
                    "reservedItems": reserved_items,
                    "createdAt": datetime.now(timezone.utc),
                }
            )
        except Exception:
            release_reserved_stock(reserved_items)
            raise
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
            detail=RAZORPAY_SSL_ERROR_DETAIL,
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
                detail=RAZORPAY_SSL_ERROR_DETAIL,
            )
        raise HTTPException(status_code=500, detail="Unable to create payment order.")


@router.post(
    "/verify",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        409: CONFLICT_RESPONSE[409],
    },
)
def verify_payment(
    request: VerifyPayment,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, user_id = customer_scope(current_user)
    if (
        not request.razorpayOrderId
        or not request.razorpayPaymentId
        or not request.razorpaySignature
    ):
        raise HTTPException(
            status_code=400,
            detail="razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.",
        )
    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": request.razorpayOrderId,
                "razorpay_payment_id": request.razorpayPaymentId,
                "razorpay_signature": request.razorpaySignature,
            }
        )
    except Exception as error:
        logger.warning("Razorpay signature mismatch: %s", error)
        raise HTTPException(
            status_code=400,
            detail="Payment signature verification failed.",
        ) from error

    try:
        validate_captured_payment(
            request.razorpayOrderId,
            request.razorpayPaymentId,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        result = fulfill_captured_payment(
            request.razorpayOrderId,
            request.razorpayPaymentId,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        send_order_confirmation(background_tasks, result["orderId"])
        send_payment_success(background_tasks, result["orderId"])
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Payment fulfillment failed after signature verification")
        raise HTTPException(
            status_code=400,
            detail="Payment verification failed.",
        )


@router.get(
    "/order/{order_id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_payment_status(
    order_id: str,
    current_user: Annotated[dict, Depends(require_customer)],
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


PAYMENT_NOT_FOUND = "Payment not found for this store."


def _fetch_store_payment(
    payment_id: str,
    current_user: dict,
    requested_tenant_id: str | None,
) -> dict:
    """Fetch a Razorpay payment only if it was made to the caller's store.

    All stores share one Razorpay account, so a payment id alone says nothing
    about which store it belongs to. The store is taken from our own records:
    the order that holds the payment id, or else the payment intent created for
    the payment's Razorpay order.
    """
    tenant_id = admin_tenant_id(current_user, requested_tenant_id)
    payment_id = str(payment_id or "").strip()
    try:
        payment_data = client.payment.fetch(payment_id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Unable to fetch payment.",
        )
    razorpay_order_id = str(payment_data.get("order_id") or "").strip()
    owned = orders.find_one(
        {"tenantId": tenant_id, "razorpayPaymentId": payment_id},
        {"_id": 1},
    )
    if not owned and razorpay_order_id:
        owned = payment_intents.find_one(
            {"tenantId": tenant_id, "razorpayOrderId": razorpay_order_id},
            {"_id": 1},
        )
    if not owned:
        raise HTTPException(status_code=404, detail=PAYMENT_NOT_FOUND)
    return payment_data


@router.get(
    "/payment/{payment_id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_payment(
    payment_id: str,
    current_user: Annotated[dict, Depends(require_permission("orders"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    payment_data = _fetch_store_payment(payment_id, current_user, tenant_id)
    return {
        "success": True,
        "payment": {
            "id": payment_data.get("id"),
            "status": payment_data.get("status"),
            "amount": payment_data.get("amount", 0) / 100,
            "method": payment_data.get("method"),
        },
    }


@router.post(
    "/refund/{payment_id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def refund(
    payment_id: str,
    current_user: Annotated[dict, Depends(require_permission("orders"))],
    payload: RefundPaymentRequest = RefundPaymentRequest(),
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    _fetch_store_payment(payment_id, current_user, tenant_id)
    razorpay_payload = None
    if payload.amount is not None:
        razorpay_payload = {"amount": int(round(payload.amount * 100))}
    try:
        if razorpay_payload:
            refund_data = client.payment.refund(payment_id, razorpay_payload)
        else:
            refund_data = client.payment.refund(payment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Refund failed.")
    owning_order = orders.find_one(
        {"razorpayPaymentId": payment_id}, {"_id": 1}
    )
    if owning_order:
        try:
            if payload.amount is not None:
                record_partial_refund(owning_order["_id"], payload.amount)
            else:
                record_order_refund(owning_order["_id"])
        except Exception:
            logger.exception(
                "Failed to reverse ledger entry for payment %s", payment_id
            )
    return {
        "success": True,
        "message": "Refund initiated successfully.",
        "refundId": refund_data.get("id"),
        "status": refund_data.get("status"),
    }


def _verify_webhook(body: bytes, signature: str) -> None:
    try:
        client.utility.verify_webhook_signature(
            body.decode("utf-8"),
            signature,
            RAZORPAY_WEBHOOK_SECRET,
        )
    except Exception as error:
        logger.exception("Invalid Razorpay webhook signature")
        alert("razorpay.webhook_signature_invalid", provider="razorpay", error_type=type(error).__name__)
        raise HTTPException(
            status_code=400,
            detail="Invalid webhook signature.",
        ) from error


def _parse_webhook_payload(body: bytes) -> dict:
    try:
        return json.loads(body)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=400,
            detail="Invalid webhook payload.",
        ) from error


def _is_transient_fulfillment_error(error: HTTPException, detail: str) -> bool:
    return (
        error.status_code == 409
        and "still being processed" in detail.lower()
    ) or (
        error.status_code == 400
        and detail == "Payment order was not found."
    )


def _fulfill_webhook_payment(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    background_tasks: BackgroundTasks,
) -> dict:
    try:
        validate_captured_payment(razorpay_order_id, razorpay_payment_id)
        result = fulfill_captured_payment(
            razorpay_order_id,
            razorpay_payment_id,
        )
        send_order_confirmation(background_tasks, result["orderId"])
        send_payment_success(background_tasks, result["orderId"])
        return {
            "success": True,
            "status": "fulfilled",
            "orderId": result.get("orderId"),
        }
    except HTTPException as error:
        detail = str(error.detail)
        if _is_transient_fulfillment_error(error, detail):
            raise HTTPException(
                status_code=503,
                detail=detail,
            ) from error
        if error.status_code in {400, 409}:
            logger.warning(
                "Webhook fulfillment terminal failure with status %s: %s",
                error.status_code,
                detail,
            )
            alert("razorpay.webhook_terminal_failure", provider="razorpay", http_status=error.status_code, detail=detail, razorpay_order_id=razorpay_order_id, razorpay_payment_id=razorpay_payment_id)
            return {
                "success": True,
                "status": "terminal",
                "detail": detail,
            }
        raise
    except Exception as error:
        logger.exception("Webhook fulfillment failed")
        alert("razorpay.webhook_failed", provider="razorpay", error=error, razorpay_order_id=razorpay_order_id, razorpay_payment_id=razorpay_payment_id)
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed.",
        ) from error


@router.post(
    "/webhook",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
        503: SERVICE_UNAVAILABLE_RESPONSE[503],
    },
)
async def webhook(request: Request, background_tasks: BackgroundTasks):
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Webhook secret is not configured.",
        )

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing webhook signature.")

    _verify_webhook(body, signature)
    payload = _parse_webhook_payload(body)

    event = payload.get("event")
    if isinstance(event, str) and event.startswith("subscription."):
        # Store subscription billing events share this signed endpoint.
        return handle_subscription_event(payload)
    if event != "payment.captured":
        return {"success": True, "status": "ignored", "event": event}

    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    razorpay_order_id = payment_entity.get("order_id")
    razorpay_payment_id = payment_entity.get("id")
    if not razorpay_order_id or not razorpay_payment_id:
        return {"success": True, "status": "ignored", "reason": "missing ids"}

    if payment_entity.get("status") != "captured":
        return {"success": True, "status": "ignored", "reason": "not captured"}

    return _fulfill_webhook_payment(
        razorpay_order_id,
        razorpay_payment_id,
        background_tasks,
    )
