import type { StorefrontLayout, ThemeColors } from "../theme/types";

export interface ThemeColorsPartial {
    primary?: string;
    secondary?: string;
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
    logo: string;
    theme: string;
    themeColors?: ThemeColorsPartial | null;
    layoutSettings?: LayoutSettingsPartial | null;
    footerContent?: FooterContentPartial | null;
    storefrontLayout?: StorefrontLayout | null;
    isActive?: boolean;
}

export type { StorefrontLayout, ThemeColors };
