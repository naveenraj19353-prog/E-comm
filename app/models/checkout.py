from pydantic import BaseModel
from typing import Optional


class CheckoutRequest(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    couponCode: Optional[str] = None
    addressId: Optional[str] = None
