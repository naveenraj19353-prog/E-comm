from fastapi import APIRouter, HTTPException, Request
from app.utils.razorpay_client import client
from app.models.payment import VerifyPayment

router = APIRouter(
    prefix="/payments",
    tags=["Payments"]
)

@router.post("/create-order")
def create_order(amount: float):

    order = client.order.create({
        "amount": int(amount * 100),  # Amount in paise
        "currency": "INR",
        "payment_capture": 1
    })

    return order

@router.post("/verify")
def verify_payment(request: VerifyPayment):

    try:

        client.utility.verify_payment_signature({
            "razorpay_order_id": request.razorpayOrderId,
            "razorpay_payment_id": request.razorpayPaymentId,
            "razorpay_signature": request.razorpaySignature
        })

        return {
            "success": True,
            "message": "Payment verified successfully."
        }

    except Exception:

        raise HTTPException(
            status_code=400,
            detail="Payment verification failed."
        )
    
@router.get("/{order_id}")
def get_payment_status(order_id: str):
    try:
        payments = client.order.fetch_payments(order_id)

        if not payments["items"]:
            return {
                "order_id": order_id,
                "status": "pending",
                "payment": None
            }

        payment = payments["items"][0]

        return {
            "order_id": order_id,
            "payment_id": payment["id"],
            "status": payment["status"],
            "amount": payment["amount"] / 100,
            "method": payment["method"],
            "email": payment.get("email"),
            "contact": payment.get("contact"),
            "created_at": payment["created_at"]
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.post("/refund/{payment_id}")
def refund(payment_id: str):
    refund = client.payment.refund(payment_id)

    return refund

@router.get("/payment/{payment_id}")
def payment(payment_id: str):
    return client.payment.fetch(payment_id)

@router.post("/webhook")
async def webhook(request: Request):
    body = await request.body()

    signature = request.headers.get("X-Razorpay-Signature")

    # Verify webhook signature here

    return {"status": "ok"}