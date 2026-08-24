from datetime import datetime
from typing import Optional
from pydantic import BaseModel
class CreateBanner(BaseModel):
    tenantId: str
    title: str
    subtitle: Optional[str] = None
    description: Optional[str] = None
    image: str
    mobileImage: Optional[str] = None
    buttonText: Optional[str] = "Shop Now"
    link: Optional[str] = None
    priority: int = 0
    isActive: bool = True
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
class UpdateBanner(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    mobileImage: Optional[str] = None
    buttonText: Optional[str] = None
    link: Optional[str] = None
    priority: Optional[int] = None
    isActive: Optional[bool] = None
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
