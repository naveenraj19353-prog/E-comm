from pydantic import BaseModel, Field

class AddCart(BaseModel):
    userId: str
    productId: str
    quantity: int = Field(gt=0)