from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class CreateAddress(BaseModel):
    tenantId: str
    userId: str

    fullName: str = Field(..., min_length=3, max_length=100)
    phone: str = Field(..., min_length=10, max_length=15)

    addressLine1: str = Field(..., min_length=5)
    addressLine2: str

    city: str
    state: str
    country: str
    postalCode: str

    addressType: str  # Home / Office / Other

    isDefault: bool = False

class UpdateAddress(BaseModel):

    model_config = ConfigDict(
        str_strip_whitespace=True
    )

    tenantId: str = Field(
        ...,
        min_length=3
    )

    fullName: Optional[str] = Field(
        default=None,
        min_length=3,
        max_length=100
    )

    phone: Optional[str] = Field(
        default=None,
        min_length=10,
        max_length=15
    )

    addressLine1: Optional[str] = Field(
        default=None,
        min_length=5
    )

    addressLine2: Optional[str] = None

    city: Optional[str] = None

    state: Optional[str] = None

    country: Optional[str] = None

    postalCode: Optional[str] = Field(
        default=None,
        min_length=4,
        max_length=10
    )

    addressType: Optional[str] = Field(
        default=None,
        pattern="^(Home|Office|Other)$"
    )

    isDefault: Optional[bool] = None