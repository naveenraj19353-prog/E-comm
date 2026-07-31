from pydantic import BaseModel, Field, StrictStr


class AddCart(BaseModel):
    tenantId: StrictStr
    userId: str
    productId: str
    quantity: int = Field(gt=0)


class UpdateCart(BaseModel):
    tenantId: StrictStr
    userId: str
    quantity: int = Field(ge=0)