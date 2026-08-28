import type { FooterContent } from "../components/Footer/types";
import { buildDefaultFooterContent } from "./footerDefaults";

export type { FooterContent, FooterSection, FooterLink } from "../components/Footer/types";

export interface ThemeColors {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    border: string;
    textBlack: string;
    textWhite: string;
    success: string;
    warning: string;
    danger: string;
}

export type WishlistIconPosition = "left" | "right";
export type HeaderLogoPosition = "left" | "center";
export type HeaderSearchPosition = "right" | "center" | "after-logo";
export type HeaderNavAlignment = "left" | "center";

export interface LayoutSettings {
    productGridColumns: number;
    cardStyle: "rounded" | "soft" | "sharp";
    sectionSpacing: "compact" | "comfortable" | "spacious";
    homeBannerStyle: "full" | "contained";
    showHomeBanner: boolean;
    showDealOfTheDay: boolean;
    showTestimonials: boolean;
    showCategorySlider: boolean;
    showProductRating: boolean;
    showQuickAddOnCard: boolean;
    showDiscountBadge: boolean;
    showHeaderSearch: boolean;
    showHeaderCategories: boolean;
    headerLogoPosition: HeaderLogoPosition;
    headerSearchPosition: HeaderSearchPosition;
    headerNavAlignment: HeaderNavAlignment;
    wishlistIconPosition: WishlistIconPosition;
    stickyHeader: boolean;
    footerLayout: "full" | "compact" | "minimal";
    showFooterSocial: boolean;
    showFooterLinks: boolean;
    productCardImageRatio: "square" | "portrait" | "landscape";
    pageWidth: "narrow" | "standard" | "wide";
    productListingLayout: "sidebar-left" | "sidebar-right" | "filters-top";
    productViewMode: "grid" | "list";
    productDetailLayout: "gallery-left" | "gallery-right" | "stacked";
    cartLayout: "split" | "stacked";
}

export interface StorefrontLayout {
    theme: string;
    themeColors: ThemeColors;
    layoutSettings: LayoutSettings;
    footerContent: FooterContent;
    isCustomized: boolean;
    source: "database" | "default";
}

export interface ThemeDraft {
    theme: string;
    themeColors: ThemeColors;
    layoutSettings: LayoutSettings;
    footerContent: FooterContent;
}

export type ThemeColorKey = keyof ThemeColors;

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
    productGridColumns: 4,
    cardStyle: "rounded",
    sectionSpacing: "comfortable",
    homeBannerStyle: "full",
    showHomeBanner: true,
    showDealOfTheDay: true,
    showTestimonials: true,
    showCategorySlider: true,
    showProductRating: true,
    showQuickAddOnCard: true,
    showDiscountBadge: true,
    showHeaderSearch: true,
    showHeaderCategories: true,
    headerLogoPosition: "left",
    headerSearchPosition: "right",
    headerNavAlignment: "left",
    wishlistIconPosition: "right",
    stickyHeader: true,
    footerLayout: "full",
    showFooterSocial: true,
    showFooterLinks: true,
    productCardImageRatio: "portrait",
    pageWidth: "standard",
    productListingLayout: "sidebar-left",
    productViewMode: "grid",
    productDetailLayout: "gallery-left",
    cartLayout: "split",
};

export const DEFAULT_THEME_COLORS: ThemeColors = {
    primary: "#2f6b52",
    secondary: "#4c8a6d",
    background: "#F9FAFB",
    surface: "#FFFFFF",
    border: "#E5E7EB",
    textBlack: "#111827",
    textWhite: "#FFFFFF",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#DC2626",
};

export const buildDefaultStorefrontLayout = (companyName = "Store"): StorefrontLayout => ({
    theme: "green",
    themeColors: { ...DEFAULT_THEME_COLORS },
    layoutSettings: { ...DEFAULT_LAYOUT_SETTINGS },
    footerContent: buildDefaultFooterContent(companyName),
    isCustomized: false,
    source: "default",
});
