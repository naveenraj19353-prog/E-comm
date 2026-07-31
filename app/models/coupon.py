from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime

class CreateCoupon(BaseModel):
    tenantId: str
    code: str
    description: str
    discountType: Literal["percentage", "fixed"]
    discountValue: float = Field(gt=0)
    minimumOrderAmount: float = 0
    maximumDiscount: float 
    usageLimit: int = 0
    startDate: datetime
    endDate: datetime

class ApplyCoupon(BaseModel):
    tenantId: str
    userId: str
    couponCode: str
