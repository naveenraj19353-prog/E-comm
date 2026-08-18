from pydantic import BaseModel, Field
from typing import Optional


class CreateTenant(BaseModel):
    tenantId: str = Field(..., min_length=3, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=100)
    logo: Optional[str] = ""
    theme: Optional[str] = "green"


class UpdateTenant(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    logo: Optional[str] = None
    theme: Optional[str] = None
    isActive: Optional[bool] = None