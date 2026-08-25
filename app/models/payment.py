from pydantic import BaseModel, Field
from typing import Optional


class CreatePaymentOrder(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    couponCode: Optional[str] = None
    addressId: str = Field(..., min_length=1)


class VerifyPayment(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    razorpayOrderId: str = Field(..., min_length=1)
    razorpayPaymentId: str = Field(..., min_length=1)
    razorpaySignature: str = Field(..., min_length=1)
    couponCode: Optional[str] = None
