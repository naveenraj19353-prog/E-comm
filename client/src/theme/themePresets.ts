import type { ThemeColors } from "./types";
import { DEFAULT_THEME_COLORS } from "./types";

export const THEME_PRESET_NAMES = ["green", "blue", "purple", "orange", "dark"] as const;
export type ThemePresetName = (typeof THEME_PRESET_NAMES)[number];

export const themePresets: Record<ThemePresetName, ThemeColors> = {
    green: {
        ...DEFAULT_THEME_COLORS,
        primary: "#2f6b52",
        secondary: "#4c8a6d",
    },
    blue: {
        ...DEFAULT_THEME_COLORS,
        primary: "#2563EB",
        secondary: "#3B82F6",
    },
    purple: {
        ...DEFAULT_THEME_COLORS,
        primary: "#7C3AED",
        secondary: "#8B5CF6",
    },
    orange: {
        ...DEFAULT_THEME_COLORS,
        primary: "#EA580C",
        secondary: "#F97316",
        background: "#FFFBEB",
        border: "#FDE68A",
    },
    dark: {
        ...DEFAULT_THEME_COLORS,
        primary: "#22C55E",
        secondary: "#16A34A",
        background: "#0F172A",
        surface: "#1E293B",
        border: "#334155",
        textBlack: "#F8FAFC",
        textWhite: "#0F172A",
    },
};

export const presetLabels: Record<ThemePresetName, string> = {
    green: "Forest Green",
    blue: "Ocean Blue",
    purple: "Royal Purple",
    orange: "Sunset Orange",
    dark: "Midnight Dark",
};
