from pydantic import BaseModel, Field
from typing import Optional

class CreateProduct(BaseModel):
    tenantId: str
    name: str
    description: str
    categoryId: str
    price: float
    discountPercentage: float = 0
    stock: int = 0
    sizes: list[str] = []
    colors: list[str] = []
    images: list[str] = []
    search: Optional[str] = None
    categoryIds: Optional[list[str]] = None
    minPrice: Optional[float] = None
    maxPrice: Optional[float] = None
    rating: Optional[float] = None
    inStock: Optional[bool] = None
    page: int = 1
    limit: int = 20
    sortBy: str = "createdAt"
    sortOrder: str = "desc"


class UpdateProduct(BaseModel):
    tenantId: str
    name: Optional[str] = None
    description: Optional[str] = None
    categoryId: Optional[str] = None
    price: Optional[float] = None
    discountPercentage: Optional[float] = None
    stock: Optional[int] = None
    sizes: Optional[list[str]] = None
    colors: Optional[list[str]] = None
    images: Optional[list[str]] = None
    isActive: Optional[bool] = None