import type { ThemeColors } from "./types";
import { DEFAULT_THEME_COLORS } from "./types";
import { themePresets, type ThemePresetName } from "./themePresets";

const THEME_COLOR_KEYS: Array<keyof ThemeColors> = [
    "primary",
    "secondary",
    "background",
    "surface",
    "border",
    "textBlack",
    "textWhite",
    "success",
    "warning",
    "danger",
];

export const pickColorOverrides = (
    saved: Partial<ThemeColors> | null | undefined,
    baseline: ThemeColors = DEFAULT_THEME_COLORS,
): Partial<ThemeColors> => {
    if (!saved) {
        return {};
    }

    const overrides: Partial<ThemeColors> = {};
    for (const key of THEME_COLOR_KEYS) {
        const value = saved[key];
        if (value && value !== baseline[key]) {
            overrides[key] = value;
        }
    }
    return overrides;
};

export const getPresetColors = (themeName: string): ThemeColors => {
    if (themeName in themePresets) {
        return themePresets[themeName as ThemePresetName];
    }
    return DEFAULT_THEME_COLORS;
};

export const resolveThemeColors = (
    themeName: string,
    ...savedSources: Array<Partial<ThemeColors> | null | undefined>
): ThemeColors => {
    const presetColors = getPresetColors(themeName);
    const savedMerged = savedSources.reduce<Partial<ThemeColors>>(
        (accumulator, source) => ({ ...accumulator, ...source }),
        {},
    );
    const overrides = pickColorOverrides(savedMerged, DEFAULT_THEME_COLORS);

    return {
        ...presetColors,
        ...overrides,
    };
};
