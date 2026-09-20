from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


def _normalize_media_type(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    lowered = str(value).strip().lower()
    if lowered in {"", "none"}:
        return None
    if lowered not in {"image", "video"}:
        raise ValueError("mediaType must be image or video.")
    return lowered


class CreateBanner(BaseModel):
    tenantId: str
    title: str
    subtitle: Optional[str] = None
    description: Optional[str] = None
    image: str
    mobileImage: Optional[str] = None
    mediaType: Optional[str] = None
    buttonText: Optional[str] = "Shop Now"
    link: Optional[str] = None
    priority: int = 0
    isActive: bool = True
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None

    @field_validator("mediaType")
    @classmethod
    def validate_media_type(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_media_type(value)


class UpdateBanner(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    mobileImage: Optional[str] = None
    mediaType: Optional[str] = None
    buttonText: Optional[str] = None
    link: Optional[str] = None
    priority: Optional[int] = None
    isActive: Optional[bool] = None
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None

    @field_validator("mediaType")
    @classmethod
    def validate_media_type(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_media_type(value)
