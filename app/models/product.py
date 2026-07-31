from pydantic import BaseModel, Field
from typing import List

class CreateProduct(BaseModel):
    tenantId: str
    name: str
    description: str
    categoryId: str
    price: float
    discountPercentage: float = 0
    stock: int
    sizes: List[str]
    colors: List[str]
    images: List[str]