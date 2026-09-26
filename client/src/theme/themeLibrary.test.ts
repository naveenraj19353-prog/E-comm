import { describe, expect, it } from "vitest";
import { STORE_FONTS } from "./storeFonts";
import { THEME_LIBRARY } from "./themeLibrary";
import { presetLabels, themePresets, THEME_TEMPLATE_NAMES } from "./themePresets";
import {
    DEFAULT_LAYOUT_SETTINGS,
    DEFAULT_THEME_COLORS,
    type LayoutSettings,
} from "./types";

/** Every closed-set layout key, so a template cannot carry an invalid option. */
const ALLOWED_LAYOUT_VALUES: Partial<Record<keyof LayoutSettings, readonly string[]>> = {
    cardStyle: ["rounded", "soft", "sharp"],
    sectionSpacing: ["compact", "comfortable", "spacious"],
    homeBannerStyle: ["full", "contained"],
    pageWidth: ["narrow", "standard", "wide"],
    productListingLayout: ["sidebar-left", "sidebar-right", "filters-top"],
    productViewMode: ["grid", "list"],
    productDetailLayout: ["gallery-left", "gallery-right", "stacked"],
    cartLayout: ["split", "stacked"],
    productCardDesign: ["classic", "studio", "minimal"],
    wishlistIconPosition: ["left", "right"],
    headerLogoPosition: ["left", "center"],
    headerSearchPosition: ["right", "center", "after-logo"],
    headerNavAlignment: ["left", "center"],
    footerLayout: ["full", "compact", "minimal"],
    productCardImageRatio: ["square", "portrait", "landscape"],
};

const toLinear = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
    const clean = hex.replace("#", "");
    return (
        0.2126 * toLinear(parseInt(clean.slice(0, 2), 16)) +
        0.7152 * toLinear(parseInt(clean.slice(2, 4), 16)) +
        0.0722 * toLinear(parseInt(clean.slice(4, 6), 16))
    );
};

const contrastRatio = (a: string, b: string) => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
};

describe("theme library", () => {
    it("ships exactly the registered templates, in order", () => {
        expect(THEME_LIBRARY.map((template) => template.id)).toEqual([
            ...THEME_TEMPLATE_NAMES,
        ]);
    });

    it("registers each template as a named theme so saved stores resolve", () => {
        THEME_LIBRARY.forEach((template) => {
            expect(themePresets[template.id]).toEqual(template.colors);
            expect(presetLabels[template.id]).toBe(template.label);
        });
        expect(new Set(THEME_LIBRARY.map((template) => template.id)).size).toBe(
            THEME_LIBRARY.length,
        );
    });

    it("defines every theme colour as a hex value", () => {
        const colorKeys = Object.keys(DEFAULT_THEME_COLORS);
        THEME_LIBRARY.forEach((template) => {
            expect(Object.keys(template.colors).sort()).toEqual(colorKeys.sort());
            colorKeys.forEach((key) => {
                expect(template.colors[key as keyof typeof DEFAULT_THEME_COLORS]).toMatch(
                    /^#[0-9A-Fa-f]{6}$/,
                );
            });
        });
    });

    it("only overrides real layout keys, with valid options", () => {
        const layoutKeys = new Set(Object.keys(DEFAULT_LAYOUT_SETTINGS));
        THEME_LIBRARY.forEach((template) => {
            Object.entries(template.layout).forEach(([key, value]) => {
                expect(layoutKeys.has(key)).toBe(true);
                const allowed = ALLOWED_LAYOUT_VALUES[key as keyof LayoutSettings];
                if (allowed) {
                    expect(allowed).toContain(String(value));
                }
            });
        });
    });

    it("ships a real font for every template", () => {
        THEME_LIBRARY.forEach((template) => {
            expect(Object.keys(STORE_FONTS)).toContain(template.layout.fontFamily);
        });
    });

    it("keeps body text readable on every palette", () => {
        THEME_LIBRARY.forEach((template) => {
            expect(
                contrastRatio(template.colors.textBlack, template.colors.background),
            ).toBeGreaterThanOrEqual(4.5);
            expect(
                contrastRatio(template.colors.textBlack, template.colors.surface),
            ).toBeGreaterThanOrEqual(4.5);
        });
    });

    it("keeps button labels readable on the primary colour", () => {
        THEME_LIBRARY.forEach((template) => {
            expect(
                contrastRatio(template.colors.textWhite, template.colors.primary),
            ).toBeGreaterThanOrEqual(4.5);
        });
    });
});
