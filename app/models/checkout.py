from pydantic import BaseModel, Field
from typing import Literal, Optional

DeliveryMethod = Literal["standard", "express"]


class CheckoutRequest(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    couponCode: Optional[str] = None
    addressId: Optional[str] = None
    deliveryMethod: DeliveryMethod = "standard"


class CreateCodOrder(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    addressId: str = Field(..., min_length=1)
    couponCode: Optional[str] = None
    deliveryMethod: DeliveryMethod = "standard"
