from pydantic import BaseModel
from typing import Optional
class CheckoutRequest(BaseModel):
    tenantId: str
    userId: str
    couponCode: Optional[str] = None
