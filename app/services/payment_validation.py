from fastapi import HTTPException
from app.database.mongo import payment_intents
from app.utils.razorpay_client import client


def validate_captured_payment(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    tenant_id: str | None = None,
    user_id: str | None = None,
) -> None:
    razorpay_order = client.order.fetch(razorpay_order_id)
    notes = razorpay_order.get("notes") or {}
    if tenant_id and notes.get("tenantId") != tenant_id:
        raise HTTPException(status_code=400, detail="Tenant mismatch.")
    if user_id and notes.get("userId") != user_id:
        raise HTTPException(status_code=400, detail="User mismatch.")

    payment = client.payment.fetch(razorpay_payment_id)
    if payment.get("order_id") != razorpay_order_id:
        raise HTTPException(
            status_code=400,
            detail="Payment does not belong to this order.",
        )
    if payment.get("status") != "captured":
        raise HTTPException(
            status_code=400,
            detail="Payment has not been captured.",
        )

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

    checkout_data = intent.get("checkout") or {}
    calculated_amount = checkout_data.get("grandTotal")
    if calculated_amount is None:
        raise HTTPException(
            status_code=400,
            detail="Checkout data is missing for this payment.",
        )
    razorpay_amount = razorpay_order["amount"] / 100
    if round(razorpay_amount, 2) != round(float(calculated_amount), 2):
        raise HTTPException(
            status_code=400,
            detail="Payment amount does not match checkout amount.",
        )
