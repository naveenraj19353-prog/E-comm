from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

BusinessType = Literal["retail", "service", "menu"]


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


class UpdateTenantTheme(BaseModel):
    theme: Optional[str] = None
    themeColors: Optional[ThemeColors] = None
    layoutSettings: Optional[LayoutSettings] = None
    footerContent: Optional[FooterContent] = None
