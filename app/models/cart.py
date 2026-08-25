from typing import Optional
from pydantic import BaseModel, Field


class AddCart(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    productId: str
    quantity: int = Field(gt=0)
    variantId: str


class UpdateCart(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    quantity: int = Field(ge=0)
    variantId: Optional[str] = None
