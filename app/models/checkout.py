from pydantic import BaseModel

class CheckoutRequest(BaseModel):
    tenantId: str
    userId: str
    couponCode: str

