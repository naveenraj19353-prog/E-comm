import type { BusinessType } from "../constants/businessTypes";
import type { HomeSectionId } from "../theme/homeSections";
import type { StorefrontLayout, ThemeColors } from "../theme/types";
import type { AboutContent } from "../pages/Legal/aboutDefaults";

export interface ThemeColorsPartial {
    primary?: string;
    secondary?: string;
    headerBackground?: string;
    background?: string;
    surface?: string;
    border?: string;
    textBlack?: string;
    textWhite?: string;
    success?: string;
    warning?: string;
    danger?: string;
}

export interface LayoutSettingsPartial {
    productGridColumns?: number;
    cardStyle?: "rounded" | "soft" | "sharp";
    sectionSpacing?: "compact" | "comfortable" | "spacious";
    homeBannerStyle?: "full" | "contained";
    homeSectionOrder?: HomeSectionId[];
    showHomeBanner?: boolean;
    showDealOfTheDay?: boolean;
    showTestimonials?: boolean;
    showCategorySlider?: boolean;
    showProductRating?: boolean;
    showQuickAddOnCard?: boolean;
    showDiscountBadge?: boolean;
    showHeaderSearch?: boolean;
    showHeaderCategories?: boolean;
    headerLogoPosition?: "left" | "center";
    headerSearchPosition?: "right" | "center" | "after-logo";
    headerNavAlignment?: "left" | "center";
    wishlistIconPosition?: "left" | "right";
    stickyHeader?: boolean;
    footerLayout?: "full" | "compact" | "minimal";
    showFooterSocial?: boolean;
    showFooterLinks?: boolean;
    productCardImageRatio?: "square" | "portrait" | "landscape";
    pageWidth?: "narrow" | "standard" | "wide";
    productListingLayout?: "sidebar-left" | "sidebar-right" | "filters-top";
    productViewMode?: "grid" | "list";
    productDetailLayout?: "gallery-left" | "gallery-right" | "stacked";
    cartLayout?: "split" | "stacked";
    productCardDesign?: "classic" | "studio" | "minimal";
}

export interface FooterLinkPartial {
    label?: string;
    href?: string;
}

export interface FooterSectionPartial {
    title?: string;
    links?: FooterLinkPartial[];
}

export interface FooterContentPartial {
    companyName?: string;
    description?: string;
    sections?: FooterSectionPartial[];
}

export interface Tenant {
    _id: string;
    tenantId: string;
    slug: string;
    name: string;
    businessType?: BusinessType;
    logo: string;
    theme: string;
    displayCurrency?: string;
    inrPerUnit?: number;
    themeColors?: ThemeColorsPartial | null;
    layoutSettings?: LayoutSettingsPartial | null;
    footerContent?: FooterContentPartial | null;
    aboutContent?: AboutContent | null;
    storefrontLayout?: StorefrontLayout | null;
    storeHours?: StoreHours;
    phone?: string;
    email?: string;
    isActive?: boolean;
}

export type StoreHoursKind = "on" | "off";

export type StoreHoursWindow = {
    kind: StoreHoursKind;
    startAt: string;
    endAt: string;
};

export type StoreHours = {
    enabled?: boolean;
    defaultOpen?: boolean;
    message?: string;
    images?: string[];
    windows?: StoreHoursWindow[];
    isOpen?: boolean;
    nextChangeAt?: string | null;
};

export type { BusinessType, StorefrontLayout, ThemeColors };
