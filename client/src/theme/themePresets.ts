import type { ThemeColors } from "./types";
import { DEFAULT_THEME_COLORS } from "./types";

/** Quick single-colour presets shown as chips in the Colors tab. */
export const COLOR_PRESET_NAMES = ["green", "blue", "purple", "orange", "dark"] as const;

/** Full store templates shipped in the Themes library (colours + layout + font). */
export const THEME_TEMPLATE_NAMES = [
    "editorial-noir",
    "rosewood-boutique",
    "nordic-slate",
    "midnight-gold",
    "electric-pop",
] as const;

/**
 * Every named theme. A store's saved `theme` is resolved against this list, so
 * library templates must stay registered here even though they are applied
 * through themeLibrary.ts.
 */
export const THEME_PRESET_NAMES = [
    ...COLOR_PRESET_NAMES,
    ...THEME_TEMPLATE_NAMES,
] as const;

export type ColorPresetName = (typeof COLOR_PRESET_NAMES)[number];
export type ThemeTemplateName = (typeof THEME_TEMPLATE_NAMES)[number];
export type ThemePresetName = (typeof THEME_PRESET_NAMES)[number];

export const themePresets: Record<ThemePresetName, ThemeColors> = {
    green: {
        ...DEFAULT_THEME_COLORS,
        primary: "#EA580C",
        secondary: "#F97316",
    },
    blue: {
        ...DEFAULT_THEME_COLORS,
        primary: "#2563EB",
        secondary: "#3B82F6",
        headerBackground: "#EFF6FF",
    },
    purple: {
        ...DEFAULT_THEME_COLORS,
        primary: "#7C3AED",
        secondary: "#8B5CF6",
        headerBackground: "#F5F3FF",
    },
    orange: {
        ...DEFAULT_THEME_COLORS,
        primary: "#EA580C",
        secondary: "#F97316",
        headerBackground: "#FFF7ED",
        background: "#FFFBEB",
        border: "#FDE68A",
    },
    dark: {
        ...DEFAULT_THEME_COLORS,
        primary: "#22C55E",
        secondary: "#16A34A",
        headerBackground: "#172033",
        background: "#0F172A",
        surface: "#1E293B",
        border: "#334155",
        textBlack: "#F8FAFC",
        textWhite: "#0F172A",
    },
    /* --- Themes library ------------------------------------------------- */
    "editorial-noir": {
        primary: "#1C1917",
        secondary: "#57534E",
        headerBackground: "#FFFFFF",
        background: "#FAFAF9",
        surface: "#FFFFFF",
        border: "#E7E5E4",
        textBlack: "#1C1917",
        textWhite: "#FFFFFF",
        success: "#047857",
        warning: "#B45309",
        danger: "#B91C1C",
    },
    "rosewood-boutique": {
        primary: "#9F1239",
        secondary: "#BE123C",
        headerBackground: "#FFF1F2",
        background: "#FFFBF7",
        surface: "#FFFFFF",
        border: "#F3D6DC",
        textBlack: "#2A1519",
        textWhite: "#FFFFFF",
        success: "#15803D",
        warning: "#B45309",
        danger: "#BE123C",
    },
    "nordic-slate": {
        primary: "#334155",
        secondary: "#475569",
        headerBackground: "#F1F5F9",
        background: "#F8FAFC",
        surface: "#FFFFFF",
        border: "#CBD5E1",
        textBlack: "#0F172A",
        textWhite: "#FFFFFF",
        success: "#047857",
        warning: "#B45309",
        danger: "#DC2626",
    },
    "midnight-gold": {
        primary: "#C8A96A",
        secondary: "#E0C48A",
        headerBackground: "#111827",
        background: "#0B1120",
        surface: "#151E31",
        border: "#2A3550",
        textBlack: "#F5F3EE",
        /* Inverted: button labels sit on the gold plate. */
        textWhite: "#0B1120",
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F87171",
    },
    "electric-pop": {
        primary: "#4F46E5",
        secondary: "#7C3AED",
        headerBackground: "#EEF2FF",
        background: "#FAFAFF",
        surface: "#FFFFFF",
        border: "#E0E7FF",
        textBlack: "#111827",
        textWhite: "#FFFFFF",
        success: "#16A34A",
        warning: "#F59E0B",
        danger: "#EF4444",
    },
};

export const presetLabels: Record<ThemePresetName, string> = {
    green: "Forest Green",
    blue: "Ocean Blue",
    purple: "Royal Purple",
    orange: "Sunset Orange",
    dark: "Midnight Dark",
    "editorial-noir": "Editorial Noir",
    "rosewood-boutique": "Rosewood Boutique",
    "nordic-slate": "Nordic Slate",
    "midnight-gold": "Midnight Gold",
    "electric-pop": "Electric Pop",
};
