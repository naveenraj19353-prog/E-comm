import type { LayoutSettings, ThemeColors, FooterContent } from "./types";

export interface ThemePreviewDraft {
    theme?: string;
    themeColors?: Partial<ThemeColors>;
    layoutSettings?: Partial<LayoutSettings>;
    footerContent?: Partial<FooterContent>;
}

const previewKey = (slug: string) => `ecommerce_theme_preview_${slug}`;

export const getThemePreviewDraft = (slug: string): ThemePreviewDraft | null => {
    const raw = localStorage.getItem(previewKey(slug));
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw) as ThemePreviewDraft;
    }
    catch {
        localStorage.removeItem(previewKey(slug));
        return null;
    }
};

export const setThemePreviewDraft = (slug: string, draft: ThemePreviewDraft): void => {
    localStorage.setItem(previewKey(slug), JSON.stringify(draft));
};

export const clearThemePreviewDraft = (slug: string): void => {
    localStorage.removeItem(previewKey(slug));
};
