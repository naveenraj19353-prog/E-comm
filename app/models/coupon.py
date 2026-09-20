from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

OfferType = Literal["general", "first_order", "product", "festival"]
DiscountType = Literal["percentage", "fixed"]


class CreateCoupon(BaseModel):
    tenantId: str
    code: str
    description: str = ""
    discountType: DiscountType
    discountValue: float = Field(gt=0)
    minimumOrderAmount: float = 0
    maximumDiscount: float = 0
    usageLimit: int = 0
    startDate: datetime
    endDate: datetime
    offerType: OfferType = "general"
    productId: Optional[str] = None
    festivalTitle: Optional[str] = None
    festivalMessage: Optional[str] = None
    isActive: bool = True


class UpdateCoupon(BaseModel):
    tenantId: Optional[str] = None
    description: Optional[str] = None
    discountType: Optional[DiscountType] = None
    discountValue: Optional[float] = Field(default=None, gt=0)
    minimumOrderAmount: Optional[float] = None
    maximumDiscount: Optional[float] = None
    usageLimit: Optional[int] = None
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
    offerType: Optional[OfferType] = None
    productId: Optional[str] = None
    festivalTitle: Optional[str] = None
    festivalMessage: Optional[str] = None
    isActive: Optional[bool] = None


class ApplyCoupon(BaseModel):
    tenantId: str
    userId: str
    couponCode: str
