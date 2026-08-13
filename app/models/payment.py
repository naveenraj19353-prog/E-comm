from pydantic import BaseModel, Field
from typing import Optional


class CreatePaymentOrder(BaseModel):
    tenantId: str = Field(..., min_length=3)
    userId: str = Field(..., min_length=1)
    couponCode: Optional[str] = None


class VerifyPayment(BaseModel):
    tenantId: str = Field(..., min_length=3)
    userId: str = Field(..., min_length=1)

    razorpayOrderId: str = Field(
        ...,
        min_length=1
    )

    razorpayPaymentId: str = Field(
        ...,
        min_length=1
    )

    razorpaySignature: str = Field(
        ...,
        min_length=1
    )

    couponCode: Optional[str] = None