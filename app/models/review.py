from pydantic import BaseModel, Field
from typing import List, Optional

class ReviewCreate(BaseModel):
    tenantId: str
    productId: str
    userId: str
    userName: str
    rating: int = Field(..., ge=1, le=5)
    title: Optional[str] = None
    comment: str
    images: List[str] = []


class UpdateReview(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    title: Optional[str] = None
    comment: str
    images: List[str] = []