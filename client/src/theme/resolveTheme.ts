import type { FooterContent, LayoutSettings, StorefrontLayout, ThemeColors, ThemeDraft } from "./types";
import { DEFAULT_LAYOUT_SETTINGS, DEFAULT_THEME_COLORS, buildDefaultStorefrontLayout } from "./types";
import { buildDefaultFooterContent } from "./footerDefaults";
import { themePresets, type ThemePresetName } from "./themePresets";
import { themes } from "./tenants/tenant002";
import { getThemePreviewDraft, type ThemePreviewDraft } from "./themeStorage";

interface FooterContentSource {
    companyName?: string;
    description?: string;
    sections?: Array<{
        title?: string;
        links?: Array<{ label?: string; href?: string }>;
    }>;
}

interface TenantThemeSource {
    name?: string;
    tenantId?: string;
    slug?: string;
    theme?: string;
    themeColors?: Partial<ThemeColors> | null;
    layoutSettings?: Partial<LayoutSettings> | null;
    footerContent?: FooterContentSource | null;
    storefrontLayout?: StorefrontLayout | null;
}

const isPresetName = (value: string): value is ThemePresetName => value in themePresets;

const mergeColors = (...sources: Array<Partial<ThemeColors> | null | undefined>): ThemeColors => ({
    ...DEFAULT_THEME_COLORS,
    ...sources.reduce<Partial<ThemeColors>>((accumulator, source) => ({
        ...accumulator,
        ...source,
    }), {}),
});

const mergeLayout = (...sources: Array<Partial<LayoutSettings> | null | undefined>): LayoutSettings => ({
    ...DEFAULT_LAYOUT_SETTINGS,
    ...sources.reduce<Partial<LayoutSettings>>((accumulator, source) => ({
        ...accumulator,
        ...source,
    }), {}),
});

const cloneFooterSections = (sections: FooterContent["sections"]) =>
    sections.map((section) => ({
        title: section.title,
        links: section.links.map((link) => ({ ...link })),
    }));

const mergeFooterContent = (
    tenantName: string | undefined,
    ...sources: Array<FooterContentSource | null | undefined>
): FooterContent => {
    const base = buildDefaultFooterContent(tenantName || "Store");
    let result: FooterContent = {
        companyName: base.companyName,
        description: base.description,
        sections: cloneFooterSections(base.sections),
    };

    for (const source of sources) {
        if (!source) {
            continue;
        }
        if (source.companyName?.trim()) {
            result.companyName = source.companyName.trim();
        }
        if (source.description?.trim()) {
            result.description = source.description.trim();
        }
        if (source.sections && source.sections.length > 0) {
            result.sections = source.sections.map((section) => ({
                title: section.title || "Section",
                links: (section.links || []).map((link) => ({
                    label: link.label || "Link",
                    href: link.href || "#",
                })),
            }));
        }
    }

    return result;
};

export const resolveThemeDraft = (
    tenant: TenantThemeSource | null,
    slug?: string,
    livePreview?: ThemePreviewDraft | null,
): ThemeDraft => {
    const preview = livePreview ?? (slug ? getThemePreviewDraft(slug) : null);
    const apiLayout = tenant?.storefrontLayout ?? buildDefaultStorefrontLayout(tenant?.name);

    const themeKey = preview?.theme
        ?? apiLayout.theme
        ?? tenant?.theme
        ?? tenant?.tenantId
        ?? slug
        ?? "green";

    const presetColors = isPresetName(themeKey)
        ? themePresets[themeKey]
        : themes[themeKey as keyof typeof themes]?.colors
            ?? themes[tenant?.tenantId as keyof typeof themes]?.colors
            ?? themes.DEFAULT.colors;

    const themeColors = mergeColors(
        presetColors,
        apiLayout.themeColors,
        tenant?.themeColors,
        preview?.themeColors,
    );

    const layoutSettings = mergeLayout(
        apiLayout.layoutSettings,
        tenant?.layoutSettings,
        preview?.layoutSettings,
    );

    const footerContent = mergeFooterContent(
        tenant?.name,
        apiLayout.footerContent,
        tenant?.footerContent,
        preview?.footerContent,
    );

    return {
        theme: preview?.theme ?? apiLayout.theme ?? tenant?.theme ?? "green",
        themeColors,
        layoutSettings,
        footerContent,
    };
};

export const applyThemeToDocument = (draft: ThemeDraft): void => {
    const root = document.documentElement;
    const { themeColors, layoutSettings } = draft;

    root.style.setProperty("--primary", themeColors.primary);
    root.style.setProperty("--secondary", themeColors.secondary);
    root.style.setProperty("--background", themeColors.background);
    root.style.setProperty("--surface", themeColors.surface);
    root.style.setProperty("--border", themeColors.border);
    root.style.setProperty("--text", themeColors.textBlack);
    root.style.setProperty("--text-black", themeColors.textBlack);
    root.style.setProperty("--text-white", themeColors.textWhite);
    root.style.setProperty("--success", themeColors.success);
    root.style.setProperty("--warning", themeColors.warning);
    root.style.setProperty("--danger", themeColors.danger);

    const cardRadius = layoutSettings.cardStyle === "sharp"
        ? "0.25rem"
        : layoutSettings.cardStyle === "soft"
            ? "1rem"
            : "0.625rem";
    const gridGap = layoutSettings.sectionSpacing === "compact"
        ? "1rem"
        : layoutSettings.sectionSpacing === "spacious"
            ? "2rem"
            : "1.5rem";
    const sectionGap = layoutSettings.sectionSpacing === "compact"
        ? "1.5rem"
        : layoutSettings.sectionSpacing === "spacious"
            ? "3rem"
            : "2.25rem";

    root.style.setProperty("--layout-grid-columns", String(layoutSettings.productGridColumns));
    root.style.setProperty("--layout-card-radius", cardRadius);
    root.style.setProperty("--layout-grid-gap", gridGap);
    root.style.setProperty("--layout-section-gap", sectionGap);
    root.style.setProperty("--layout-banner-radius", layoutSettings.homeBannerStyle === "contained" ? "1rem" : "0");

    const pageMaxWidth = layoutSettings.pageWidth === "narrow"
        ? "64rem"
        : layoutSettings.pageWidth === "wide"
            ? "100%"
            : "90%";
    root.style.setProperty("--layout-page-max-width", pageMaxWidth);

    const imageRatio = layoutSettings.productCardImageRatio === "square"
        ? "1 / 1"
        : layoutSettings.productCardImageRatio === "landscape"
            ? "4 / 3"
            : "4 / 5";
    root.style.setProperty("--layout-product-image-ratio", imageRatio);

    root.dataset.showBanner = layoutSettings.showHomeBanner ? "true" : "false";
    root.dataset.showDeals = layoutSettings.showDealOfTheDay ? "true" : "false";
    root.dataset.showTestimonials = layoutSettings.showTestimonials ? "true" : "false";
    root.dataset.showCategories = layoutSettings.showCategorySlider ? "true" : "false";
    root.dataset.showHeaderSearch = layoutSettings.showHeaderSearch ? "true" : "false";
    root.dataset.showHeaderCategories = layoutSettings.showHeaderCategories ? "true" : "false";
    root.dataset.headerLogoPosition = layoutSettings.headerLogoPosition;
    root.dataset.headerSearchPosition = layoutSettings.headerSearchPosition;
    root.dataset.headerNavAlignment = layoutSettings.headerNavAlignment;
    root.dataset.wishlistPosition = layoutSettings.wishlistIconPosition;
    root.dataset.bannerStyle = layoutSettings.homeBannerStyle;
    root.dataset.listingLayout = layoutSettings.productListingLayout;
    root.dataset.productView = layoutSettings.productViewMode;
    root.dataset.detailLayout = layoutSettings.productDetailLayout;
    root.dataset.cartLayout = layoutSettings.cartLayout;
    root.dataset.pageWidth = layoutSettings.pageWidth;
    root.dataset.stickyHeader = layoutSettings.stickyHeader ? "true" : "false";
    root.dataset.footerLayout = layoutSettings.footerLayout;
    root.dataset.productImageRatio = layoutSettings.productCardImageRatio;
};

export const getStorefrontLayoutSource = (tenant: TenantThemeSource | null): StorefrontLayout["source"] => {
    return tenant?.storefrontLayout?.source ?? "default";
};
