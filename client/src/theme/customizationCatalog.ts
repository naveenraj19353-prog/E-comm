import { DEFAULT_LAYOUT_SETTINGS, DEFAULT_THEME_COLORS } from "./types";
import { THEME_PRESET_NAMES } from "./themePresets";

export const CUSTOMIZATION_GROUPS = [
  {
    id: "home",
    title: "Home",
    lines: [
      "Home banner on/off + full or contained width",
      "Category slider, deal of the day, testimonials",
      "Page width: narrow, standard (90%), or wide (100%)",
    ],
  },
  {
    id: "catalog",
    title: "Catalog",
    lines: [
      "Filters left / right / top",
      "Grid or list view, 2–5 columns",
      "Product detail & cart layouts, card style, spacing",
    ],
  },
  {
    id: "components",
    title: "Components",
    lines: [
      "Wishlist heart position on cards",
      "Image ratio: square, portrait, landscape",
      "Rating, quick add, and discount badge toggles",
    ],
  },
  {
    id: "chrome",
    title: "Header & Footer",
    lines: [
      "Sticky header, search bar, logo & nav positions",
      "Category links in header",
      "Footer full / compact / minimal + social & links",
    ],
  },
  {
    id: "footer",
    title: "Footer content",
    lines: [
      "Company name and description",
      "Editable link columns for shoppers",
    ],
  },
  {
    id: "colors",
    title: "Colors",
    lines: [
      "Presets: Forest, Ocean, Purple, Sunset, Midnight",
      "Primary, secondary, background, surface, border, text",
      "Live preview before save to database",
    ],
  },
] as const;

const STUDIO_COLOR_KEYS = [
  "primary",
  "secondary",
  "background",
  "surface",
  "border",
  "textBlack",
] as const;

/** Discrete knobs in Store layout studio (layout + color pickers + presets). */
export function getCustomizationStats() {
  const layoutControls = Object.keys(DEFAULT_LAYOUT_SETTINGS).length;
  const colorControls = STUDIO_COLOR_KEYS.length;
  const presets = THEME_PRESET_NAMES.length;
  const groups = CUSTOMIZATION_GROUPS.length;
  const highlightLines = CUSTOMIZATION_GROUPS.reduce(
    (sum, group) => sum + group.lines.length,
    0,
  );

  return {
    total: layoutControls + colorControls + presets,
    layoutControls,
    colorControls,
    presets,
    groups,
    highlightLines,
    // Keep DEFAULT_THEME_COLORS referenced so tree-shaking doesn't drop types usage.
    colorSystemKeys: Object.keys(DEFAULT_THEME_COLORS).length,
  };
}

export const STUDIO_SCREENSHOTS = [
  {
    id: "home",
    label: "Home layout",
    caption: "Banner, categories, deals, page width",
    image: "/images/welcome/studio-home.png",
  },
  {
    id: "catalog",
    label: "Catalog layout",
    caption: "Filters, grid columns, card style",
    image: "/images/welcome/studio-catalog.png",
  },
  {
    id: "colors",
    label: "Colors & presets",
    caption: "Theme presets + brand palette",
    image: "/images/welcome/studio-colors.png",
  },
] as const;
