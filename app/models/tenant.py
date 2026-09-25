from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationInfo, field_validator

from app.services.store_analytics import (
    normalize_ga4_measurement_id,
    normalize_meta_pixel_id,
)
from app.services.store_profile import normalize_gstin, normalize_social_link

BusinessType = Literal["retail", "service", "menu"]
TenantApprovalStatus = Literal["pending", "approved", "suspended"]
StoreFont = Literal[
    "default",
    "inter",
    "poppins",
    "roboto",
    "lato",
    "montserrat",
    "nunito",
    "open-sans",
    "dm-sans",
    "playfair-display",
    "merriweather",
]


class ThemeColors(BaseModel):
    primary: Optional[str] = None
    secondary: Optional[str] = None
    headerBackground: Optional[str] = None
    background: Optional[str] = None
    surface: Optional[str] = None
    border: Optional[str] = None
    textBlack: Optional[str] = None
    textWhite: Optional[str] = None
    success: Optional[str] = None
    warning: Optional[str] = None
    danger: Optional[str] = None


class LayoutSettings(BaseModel):
    productGridColumns: Optional[int] = Field(default=None, ge=2, le=5)
    cardStyle: Optional[str] = None
    sectionSpacing: Optional[str] = None
    homeBannerStyle: Optional[str] = None
    homeSectionOrder: Optional[list[str]] = None
    showHomeBanner: Optional[bool] = None
    showDealOfTheDay: Optional[bool] = None
    showTestimonials: Optional[bool] = None
    showCategorySlider: Optional[bool] = None
    showProductRating: Optional[bool] = None
    showQuickAddOnCard: Optional[bool] = None
    showDiscountBadge: Optional[bool] = None
    showHeaderSearch: Optional[bool] = None
    showHeaderCategories: Optional[bool] = None
    headerLogoPosition: Optional[str] = None
    headerSearchPosition: Optional[str] = None
    headerNavAlignment: Optional[str] = None
    wishlistIconPosition: Optional[str] = None
    stickyHeader: Optional[bool] = None
    footerLayout: Optional[str] = None
    showFooterSocial: Optional[bool] = None
    showFooterLinks: Optional[bool] = None
    productCardImageRatio: Optional[str] = None
    pageWidth: Optional[str] = None
    productListingLayout: Optional[str] = None
    productViewMode: Optional[str] = None
    productDetailLayout: Optional[str] = None
    cartLayout: Optional[str] = None
    productCardDesign: Optional[str] = None
    # Storefront font (REQ-070); "default" keeps the built-in fonts.
    fontFamily: Optional[StoreFont] = None


class FooterLink(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    href: str = Field(..., min_length=1, max_length=500)


class FooterSection(BaseModel):
    title: str = Field(..., min_length=1, max_length=80)
    links: list[FooterLink] = Field(default_factory=list)


class FooterContent(BaseModel):
    companyName: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    sections: Optional[list[FooterSection]] = None


class AboutSection(BaseModel):
    heading: Optional[str] = Field(default=None, max_length=120)
    body: Optional[str] = Field(default=None, max_length=4000)


class AboutContent(BaseModel):
    sections: Optional[list[AboutSection]] = None


class StoreHoursWindow(BaseModel):
    kind: Literal["on", "off"]
    startAt: str = Field(..., min_length=1, max_length=40)
    endAt: str = Field(..., min_length=1, max_length=40)


class StoreHours(BaseModel):
    enabled: Optional[bool] = False
    defaultOpen: Optional[bool] = True
    message: Optional[str] = Field(default="", max_length=400)
    images: Optional[list[str]] = None
    windows: Optional[list[StoreHoursWindow]] = None


class StoreAnalytics(BaseModel):
    """Optional per-store tracking ids. Empty string clears an id."""

    ga4MeasurementId: Optional[str] = Field(default=None, max_length=32)
    metaPixelId: Optional[str] = Field(default=None, max_length=32)

    @field_validator("ga4MeasurementId", mode="before")
    @classmethod
    def _validate_ga4(cls, value):
        return normalize_ga4_measurement_id(value)

    @field_validator("metaPixelId", mode="before")
    @classmethod
    def _validate_pixel(cls, value):
        return normalize_meta_pixel_id(value)


class BusinessDetails(BaseModel):
    """Business details shown on the storefront (REQ-011). Empty string clears a field."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    legalName: Optional[str] = Field(default=None, max_length=120)
    addressLine1: Optional[str] = Field(default=None, max_length=120)
    addressLine2: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=60)
    state: Optional[str] = Field(default=None, max_length=60)
    postalCode: Optional[str] = Field(default=None, max_length=12)
    country: Optional[str] = Field(default=None, max_length=60)
    gstin: Optional[str] = Field(default=None, max_length=20)

    @field_validator("legalName", "addressLine1", "addressLine2", "city", "state", "postalCode", "country")
    @classmethod
    def _blank_to_none(cls, value: Optional[str]) -> Optional[str]:
        return value or None

    @field_validator("gstin", mode="before")
    @classmethod
    def _validate_gstin(cls, value):
        return normalize_gstin(value)


class StoreSeo(BaseModel):
    """Search-engine title and description for the store home page (REQ-106, REQ-107).
    Empty clears it, and the store name / footer text is used instead."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: Optional[str] = Field(default=None, max_length=70)
    description: Optional[str] = Field(default=None, max_length=160)

    @field_validator("title", "description")
    @classmethod
    def _blank_to_none(cls, value: Optional[str]) -> Optional[str]:
        return value or None


class SocialLinks(BaseModel):
    """Storefront footer social links (INT-013). Empty string removes a link."""

    model_config = ConfigDict(extra="forbid")

    facebook: Optional[str] = None
    instagram: Optional[str] = None
    x: Optional[str] = None
    linkedin: Optional[str] = None
    youtube: Optional[str] = None

    @field_validator("facebook", "instagram", "x", "linkedin", "youtube", mode="before")
    @classmethod
    def _validate_link(cls, value, info: ValidationInfo):
        return normalize_social_link(info.field_name, value)


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
    businessType: BusinessType
    logo: Optional[str] = ""
    theme: Optional[str] = "green"
    displayCurrency: Optional[str] = "INR"
    inrPerUnit: Optional[float] = None
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
    )


class RegisterStore(BaseModel):
    """Public self-serve store signup. tenantId is set to slug server-side."""

    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=48)
    businessType: BusinessType
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=20)
    password: str = Field(..., min_length=6, max_length=128)
    otp: str = Field(..., min_length=6, max_length=6)


class SendStoreSignupOtpRequest(BaseModel):
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=20)


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
    businessType: Optional[BusinessType] = None
    logo: Optional[str] = None
    theme: Optional[str] = None
    displayCurrency: Optional[str] = None
    inrPerUnit: Optional[float] = None
    themeColors: Optional[ThemeColors] = None
    layoutSettings: Optional[LayoutSettings] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    password: Optional[str] = Field(
        default=None,
        min_length=6,
        max_length=128,
    )
    isActive: Optional[bool] = None
    storeHours: Optional[StoreHours] = None
    analytics: Optional[StoreAnalytics] = None
    # Stock at or below this counts as low (0 turns low-stock alerts off).
    lowStockThreshold: Optional[int] = Field(default=None, ge=0, le=100000)
    businessDetails: Optional[BusinessDetails] = None
    socialLinks: Optional[SocialLinks] = None
    seo: Optional[StoreSeo] = None
    # Order value (INR, after coupon) from which delivery is free; empty/0 = off. REQ-087.
    freeDeliveryThreshold: Optional[float] = Field(default=None, ge=0, le=10_000_000)


class UpdateTenantApproval(BaseModel):
    status: TenantApprovalStatus


class UpdateTenantTheme(BaseModel):
    theme: Optional[str] = None
    themeColors: Optional[ThemeColors] = None
    layoutSettings: Optional[LayoutSettings] = None
    footerContent: Optional[FooterContent] = None
    aboutContent: Optional[AboutContent] = None
