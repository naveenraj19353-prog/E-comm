from typing import Optional
from pydantic import BaseModel, EmailStr, Field
# ==========================================================
# CREATE TENANT
# ==========================================================
class CreateTenant(BaseModel):
    tenantId: str = Field(
        ...,
        min_length=2,
        max_length=100,
    )
    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
    )
    slug: str = Field(
        ...,
        min_length=2,
        max_length=100,
    )
    logo: Optional[str] = ""
    theme: Optional[str] = "green"
    email: EmailStr
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
    )
# ==========================================================
# UPDATE TENANT
# ==========================================================
class UpdateTenant(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100,
    )
    slug: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100,
    )
    logo: Optional[str] = None
    theme: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(
        default=None,
        min_length=6,
        max_length=128,
    )
    isActive: Optional[bool] = None
