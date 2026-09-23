import type { ThemeColors } from "./types";
import { DEFAULT_THEME_COLORS } from "./types";

export const THEME_PRESET_NAMES = ["green", "blue", "purple", "orange", "dark"] as const;
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
};

export const presetLabels: Record<ThemePresetName, string> = {
    green: "Forest Green",
    blue: "Ocean Blue",
    purple: "Royal Purple",
    orange: "Sunset Orange",
    dark: "Midnight Dark",
};
