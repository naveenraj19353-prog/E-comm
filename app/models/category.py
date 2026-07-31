from pydantic import BaseModel, HttpUrl, StrictStr
from typing import Optional


class CreateCategory(BaseModel):
    tenantId: StrictStr
    name: StrictStr
    description: StrictStr
    image: StrictStr


class UpdateCategory(BaseModel):
    tenantId: StrictStr
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[HttpUrl] = None
    isActive: Optional[bool] = None