from pydantic import BaseModel, HttpUrl, StrictStr
from typing import Optional

from app.models.tax_fields import GstRate
class CreateCategory(BaseModel):
    tenantId: StrictStr
    name: StrictStr
    description: StrictStr
    image: StrictStr
    # Rate applied to products in this category that define none of their own,
    # so a merchant rates "Eyewear" once instead of every SKU.
    defaultGstRate: GstRate = None
class UpdateCategory(BaseModel):
    tenantId: StrictStr
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[HttpUrl] = None
    isActive: Optional[bool] = None
    defaultGstRate: GstRate = None
