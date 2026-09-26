import { themePresets, type ThemeTemplateName } from "./themePresets";
import type { LayoutSettings, ThemeColors } from "./types";

/**
 * A ready-made store look. Unlike a colour preset (which only swaps colours),
 * a library template moves palette, layout and font together, so applying one
 * produces a complete direction rather than a recolour.
 *
 * `layout` holds only the deltas; anything omitted keeps the store's current
 * setting, which is what makes a template safe to apply on a configured store.
 */
export interface ThemeTemplate {
    id: ThemeTemplateName;
    label: string;
    /** The kinds of catalogue this direction suits. */
    bestFor: string;
    /** One line on what makes the direction distinct. */
    description: string;
    /** Short chips shown on the card. */
    tags: string[];
    colors: ThemeColors;
    layout: Partial<LayoutSettings>;
}

export const THEME_LIBRARY: ThemeTemplate[] = [
    {
        id: "editorial-noir",
        label: "Editorial Noir",
        bestFor: "Luxury eyewear, jewellery, couture",
        description:
            "Gallery-like and near-monochrome. Photography leads, type is serif, and nothing shouts a discount.",
        tags: ["Sharp corners", "Minimal cards", "Portrait images", "Serif type"],
        colors: themePresets["editorial-noir"],
        layout: {
            cardStyle: "sharp",
            sectionSpacing: "spacious",
            productCardDesign: "minimal",
            productListingLayout: "filters-top",
            productGridColumns: 3,
            showDiscountBadge: false,
            showProductRating: false,
            productCardImageRatio: "portrait",
            pageWidth: "narrow",
            homeBannerStyle: "contained",
            productDetailLayout: "gallery-right",
            fontFamily: "playfair-display",
        },
    },
    {
        id: "rosewood-boutique",
        label: "Rosewood Boutique",
        bestFor: "Beauty, artisan goods, gifting, kids",
        description:
            "Soft and tactile. Rosewood accents, warm off-white paper, centred card copy and generous rounding.",
        tags: ["Soft corners", "Studio cards", "Centred copy", "Sidebar filters"],
        colors: themePresets["rosewood-boutique"],
        layout: {
            cardStyle: "soft",
            sectionSpacing: "comfortable",
            productCardDesign: "studio",
            productListingLayout: "sidebar-left",
            productGridColumns: 3,
            showDiscountBadge: true,
            showProductRating: true,
            productCardImageRatio: "portrait",
            pageWidth: "standard",
            homeBannerStyle: "contained",
            cartLayout: "split",
            fontFamily: "dm-sans",
        },
    },
    {
        id: "nordic-slate",
        label: "Nordic Slate",
        bestFor: "Electronics, tools, hardware, wholesale",
        description:
            "Functional and scannable. One neutral hue, square images, top filter bar and a denser grid.",
        tags: ["Rounded corners", "Classic cards", "Square images", "Dense 4-up"],
        colors: themePresets["nordic-slate"],
        layout: {
            cardStyle: "rounded",
            sectionSpacing: "compact",
            productCardDesign: "classic",
            productListingLayout: "filters-top",
            productGridColumns: 4,
            showDiscountBadge: true,
            showProductRating: true,
            productCardImageRatio: "square",
            pageWidth: "wide",
            stickyHeader: true,
            fontFamily: "inter",
        },
    },
    {
        id: "midnight-gold",
        label: "Midnight Gold",
        bestFor: "Watches, spirits, premium gifting",
        description:
            "Ink canvas with a champagne-gold call to action. Button text is inverted so the gold reads as a plate.",
        tags: ["Dark canvas", "Sharp corners", "Studio cards", "Gold CTA"],
        colors: themePresets["midnight-gold"],
        layout: {
            cardStyle: "sharp",
            sectionSpacing: "spacious",
            productCardDesign: "studio",
            productGridColumns: 3,
            showDiscountBadge: false,
            showProductRating: false,
            productCardImageRatio: "portrait",
            productDetailLayout: "gallery-left",
            pageWidth: "standard",
            homeBannerStyle: "full",
            fontFamily: "playfair-display",
        },
    },
    {
        id: "electric-pop",
        label: "Electric Pop",
        bestFor: "Fast fashion, gadgets, D2C",
        description:
            "Loud and conversion-led. Saturated indigo, discount badges, wishlist moved left, dense grid.",
        tags: ["Soft corners", "Classic cards", "Badges on", "Sticky header"],
        colors: themePresets["electric-pop"],
        layout: {
            cardStyle: "soft",
            sectionSpacing: "comfortable",
            productCardDesign: "classic",
            productListingLayout: "sidebar-left",
            productGridColumns: 4,
            showDiscountBadge: true,
            showQuickAddOnCard: true,
            showProductRating: true,
            productCardImageRatio: "square",
            wishlistIconPosition: "left",
            headerSearchPosition: "center",
            stickyHeader: true,
            pageWidth: "wide",
            fontFamily: "poppins",
        },
    },
];

export const findThemeTemplate = (id: string): ThemeTemplate | undefined =>
    THEME_LIBRARY.find((template) => template.id === id);
