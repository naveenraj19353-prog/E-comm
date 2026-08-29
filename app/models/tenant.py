from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class ThemeColors(BaseModel):
    primary: Optional[str] = None
    secondary: Optional[str] = None
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
    themeColors: Optional[ThemeColors] = None
    layoutSettings: Optional[LayoutSettings] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(
        default=None,
        min_length=6,
        max_length=128,
    )
    isActive: Optional[bool] = None


class UpdateTenantTheme(BaseModel):
    theme: Optional[str] = None
    themeColors: Optional[ThemeColors] = None
    layoutSettings: Optional[LayoutSettings] = None
    footerContent: Optional[FooterContent] = None
