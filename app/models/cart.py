from pydantic import BaseModel, Field
class AddCart(BaseModel):
    tenantId: str
    userId: str
    productId: str
    quantity: int = Field(gt=0)
    variantId: str
class UpdateCart(BaseModel):
    tenantId: str
    userId: str
    quantity: int = Field(ge=0)
    variantId: str
