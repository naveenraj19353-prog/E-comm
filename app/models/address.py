from typing import Optional
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)
# ============================================================
# CREATE ADDRESS
# ============================================================
class CreateAddress(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    tenantId: Optional[str] = Field(default=None, min_length=3)
    userId: Optional[str] = None
    fullName: str = Field(..., min_length=3, max_length=100)
    phone: str = Field(..., min_length=10, max_length=15)
    addressLine1: str = Field(..., min_length=5)
    addressLine2: Optional[str] = ""
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    country: str = Field(..., min_length=2, max_length=100)
    postalCode: str = Field(..., min_length=4, max_length=10)
    addressType: str = Field(..., pattern="^(Home|Office|Other)$")
    isDefault: bool = False
# ============================================================
# UPDATE ADDRESS
# ============================================================
class UpdateAddress(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    tenantId: str = Field(..., min_length=3)
    fullName: Optional[str] = Field(default=None, min_length=3, max_length=100)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15)
    addressLine1: Optional[str] = Field(default=None, min_length=5)
    addressLine2: Optional[str] = None
    city: Optional[str] = Field(default=None, min_length=2, max_length=100)
    state: Optional[str] = Field(default=None, min_length=2, max_length=100)
    country: Optional[str] = Field(default=None, min_length=2, max_length=100)
    postalCode: Optional[str] = Field(default=None, min_length=4, max_length=10)
    addressType: Optional[str] = Field(default=None, pattern="^(Home|Office|Other)$")
    isDefault: Optional[bool] = None
