/**
 * Storefront fonts (REQ-070). Keys match StoreFont in app/models/tenant.py.
 * "default" keeps the built-in fonts, so existing stores look the same.
 */

export type StoreFontKey =
    | "default"
    | "inter"
    | "poppins"
    | "roboto"
    | "lato"
    | "montserrat"
    | "nunito"
    | "open-sans"
    | "dm-sans"
    | "playfair-display"
    | "merriweather";

type StoreFont = {
    label: string;
    /** CSS font-family stack; empty for the built-in default. */
    stack: string;
    /** Google Fonts `family` query value. */
    google?: string;
};

export const STORE_FONTS: Record<StoreFontKey, StoreFont> = {
    default: { label: "Default", stack: "" },
    inter: { label: "Inter", stack: '"Inter", "Segoe UI", sans-serif', google: "Inter:wght@400;500;600;700" },
    poppins: { label: "Poppins", stack: '"Poppins", "Segoe UI", sans-serif', google: "Poppins:wght@400;500;600;700" },
    roboto: { label: "Roboto", stack: '"Roboto", "Segoe UI", sans-serif', google: "Roboto:wght@400;500;700" },
    lato: { label: "Lato", stack: '"Lato", "Segoe UI", sans-serif', google: "Lato:wght@400;700" },
    montserrat: {
        label: "Montserrat",
        stack: '"Montserrat", "Segoe UI", sans-serif',
        google: "Montserrat:wght@400;500;600;700",
    },
    nunito: { label: "Nunito", stack: '"Nunito", "Segoe UI", sans-serif', google: "Nunito:wght@400;600;700" },
    "open-sans": { label: "Open Sans", stack: '"Open Sans", "Segoe UI", sans-serif', google: "Open+Sans:wght@400;600;700" },
    "dm-sans": { label: "DM Sans", stack: '"DM Sans", "Segoe UI", sans-serif', google: "DM+Sans:wght@400;500;700" },
    "playfair-display": {
        label: "Playfair Display (serif)",
        stack: '"Playfair Display", Georgia, serif',
        google: "Playfair+Display:wght@400;600;700",
    },
    merriweather: { label: "Merriweather (serif)", stack: '"Merriweather", Georgia, serif', google: "Merriweather:wght@400;700" },
};

export const STORE_FONT_OPTIONS = Object.entries(STORE_FONTS).map(
    ([key, font]) => [key, font.label] as [StoreFontKey, string],
);

const STYLESHEET_ID = "store-font-stylesheet";

/** Load the chosen Google Font and expose it as --store-font (removed for "default"). */
export function applyStoreFont(key: string | undefined): void {
    const font = STORE_FONTS[key as StoreFontKey];
    const root = document.documentElement;
    const existing = document.getElementById(STYLESHEET_ID) as HTMLLinkElement | null;
    if (!font?.google) {
        root.style.removeProperty("--store-font");
        existing?.remove();
        return;
    }
    const href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
    if (existing) {
        if (existing.href !== href) {
            existing.href = href;
        }
    } else {
        const link = document.createElement("link");
        link.id = STYLESHEET_ID;
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
    }
    root.style.setProperty("--store-font", font.stack);
}
