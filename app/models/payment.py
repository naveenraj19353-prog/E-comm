from pydantic import BaseModel

class VerifyPayment(BaseModel):
    tenantId: str
    userId: str
    razorpayOrderId: str
    razorpayPaymentId: str
    razorpaySignature: str