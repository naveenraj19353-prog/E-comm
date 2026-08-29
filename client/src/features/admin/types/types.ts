import type { StorefrontLayout } from "../../../theme/types";

export type { StorefrontLayout };

export interface Tenant {
    _id: string;
    tenantId: string;
    name: string;
    slug: string;
    logo: string;
    theme: string;
    themeColors?: ThemeColors | null;
    layoutSettings?: LayoutSettings | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ThemeColors {
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

export interface LayoutSettings {
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
export interface TenantResponse {
    success: boolean;
    count: number;
    data: Tenant[];
}
export interface SingleTenantResponse {
    success: boolean;
    message?: string;
    tenantId?: string;
    id?: string;
    data: Tenant;
}
export interface CreateTenantPayload {
    tenantId: string;
    name: string;
    slug: string;
    logo?: string;
    theme?: string;
    email: string;
    password: string;
}
export interface UpdateTenantPayload {
    name?: string;
    slug?: string;
    logo?: string;
    theme?: string;
    themeColors?: ThemeColors;
    layoutSettings?: LayoutSettings;
    isActive?: boolean;
}

export interface UpdateTenantThemePayload {
    theme?: string;
    themeColors?: ThemeColors;
    layoutSettings?: LayoutSettings;
    footerContent?: FooterContent;
}

export interface FooterLink {
    label: string;
    href: string;
}

export interface FooterSection {
    title: string;
    links: FooterLink[];
}

export interface FooterContent {
    companyName?: string;
    description?: string;
    sections?: FooterSection[];
}
export interface Product {
    _id: string;
    tenantId: string;
    name: string;
    description: string;
    categoryId: string;
    price: number;
    discountPercentage: number;
    finalPrice: number;
    stock: number;
    sizes: string[];
    colors: string[];
    images: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    averageRating: number;
    reviewCount: number;
}
export interface ProductsResponse {
    success: boolean;
    count: number;
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    data: Product[];
}
export interface ProductQueryParams {
    tenantId: string;
    page?: number;
    limit?: number;
    categoryIds?: string[];
    minPrice?: number;
    maxPrice?: number;
    sizes?: string[];
    colors?: string[];
    rating?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    includeInactive?: boolean;
}
