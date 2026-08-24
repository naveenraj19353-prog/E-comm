from pydantic import BaseModel, StrictStr
class WishList(BaseModel):
    tenantId: StrictStr
    userId: str
    productId: str
