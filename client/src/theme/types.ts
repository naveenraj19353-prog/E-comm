import type { FooterContent } from "../components/Footer/types";
import type { AboutContent } from "../pages/Legal/aboutDefaults";
import { buildDefaultFooterContent } from "./footerDefaults";
import { defaultAboutContent } from "../pages/Legal/aboutDefaults";
import { DEFAULT_HOME_SECTION_ORDER, type HomeSectionId } from "./homeSections";

export type { FooterContent, FooterSection, FooterLink } from "../components/Footer/types";
export type { AboutContent, AboutSectionContent } from "../pages/Legal/aboutDefaults";

export interface ThemeColors {
    primary: string;
    secondary: string;
    headerBackground: string;
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
    homeSectionOrder: HomeSectionId[];
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
    productCardDesign: "classic" | "studio" | "minimal";
}

export interface StorefrontLayout {
    theme: string;
    themeColors: ThemeColors;
    layoutSettings: LayoutSettings;
    footerContent: FooterContent;
    aboutContent: AboutContent;
    isCustomized: boolean;
    source: "database" | "default";
}

export interface ThemeDraft {
    theme: string;
    themeColors: ThemeColors;
    layoutSettings: LayoutSettings;
    footerContent: FooterContent;
    aboutContent: AboutContent;
}

export type ThemeColorKey = keyof ThemeColors;

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
    productGridColumns: 4,
    cardStyle: "rounded",
    sectionSpacing: "comfortable",
    homeBannerStyle: "full",
    homeSectionOrder: [...DEFAULT_HOME_SECTION_ORDER],
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
    productCardDesign: "classic",
};

export const DEFAULT_THEME_COLORS: ThemeColors = {
    primary: "#2f6b52",
    secondary: "#4c8a6d",
    headerBackground: "#F1F6F3",
    background: "#F9FAFB",
    surface: "#FFFFFF",
    border: "#E5E7EB",
    textBlack: "#111827",
    textWhite: "#FFFFFF",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#DC2626",
};

export const buildDefaultStorefrontLayout = (
    companyName = "Store",
    businessType?: string | null,
): StorefrontLayout => ({
    theme: "green",
    themeColors: { ...DEFAULT_THEME_COLORS },
    layoutSettings: { ...DEFAULT_LAYOUT_SETTINGS },
    footerContent: buildDefaultFooterContent(companyName, businessType),
    aboutContent: defaultAboutContent(companyName),
    isCustomized: false,
    source: "default",
});
