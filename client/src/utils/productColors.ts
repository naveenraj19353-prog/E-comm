const COLOR_MAP: Record<string, string> = {
    black: "#111827",
    white: "#ffffff",
    red: "#ef4444",
    green: "#22c55e",
    blue: "#3b82f6",
    yellow: "#eab308",
    grey: "#9ca3af",
    gray: "#9ca3af",
    pink: "#ec4899",
    orange: "#f97316",
    purple: "#a855f7",
    violet: "#8b5cf6",
    brown: "#92400e",
    navy: "#1e3a8a",
    beige: "#d6c2a1",
    cream: "#f5f0e1",
    maroon: "#7f1d1d",
    teal: "#14b8a6",
    cyan: "#06b6d4",
    aqua: "#22d3ee",
    mint: "#98d8c8",
    "mint blue": "#7dd3c7",
    mintblue: "#7dd3c7",
    "sky blue": "#38bdf8",
    skyblue: "#38bdf8",
    "light blue": "#93c5fd",
    lightblue: "#93c5fd",
    "dark blue": "#1e40af",
    darkblue: "#1e40af",
    "navy blue": "#1e3a8a",
    navyblue: "#1e3a8a",
    turquoise: "#2dd4bf",
    olive: "#6b8e23",
    gold: "#f59e0b",
    silver: "#c0c0c0",
    charcoal: "#374151",
    ivory: "#fffff0",
    coral: "#fb7185",
    lavender: "#c4b5fd",
    magenta: "#d946ef",
    indigo: "#6366f1",
    khaki: "#c3b091",
    mustard: "#ca8a04",
    peach: "#fdba74",
    rose: "#fb7185",
    wine: "#881337",
    rust: "#b45309",
    sand: "#e7d3a5",
    taupe: "#b5a89a",
};

const CSS_NAMED_COLORS = new Set([
    "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
    "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
    "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
    "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
    "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
    "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
    "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
    "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite",
    "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew",
    "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush",
    "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
    "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink",
    "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey",
    "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta",
    "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
    "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
    "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin",
    "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered",
    "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred",
    "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple",
    "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon",
    "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue",
    "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal",
    "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke",
    "yellow", "yellowgreen",
]);

const normalizeColorKey = (color: string): string =>
    color.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const compactColorKey = (color: string): string =>
    normalizeColorKey(color).replace(/\s+/g, "");

/** Stable pastel-ish hex for unknown color names (e.g. brand-specific shades). */
const hashColorToHex = (input: string): string => {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
        hash = (hash << 5) - hash + input.charCodeAt(index);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    const saturation = 48 + (Math.abs(hash) % 20);
    const lightness = 52 + (Math.abs(hash >> 3) % 12);
    return hslToHex(hue, saturation, lightness);
};

const hslToHex = (h: number, s: number, l: number): string => {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const match = lightness - chroma / 2;
    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) {
        r = chroma;
        g = x;
    } else if (h < 120) {
        r = x;
        g = chroma;
    } else if (h < 180) {
        g = chroma;
        b = x;
    } else if (h < 240) {
        g = x;
        b = chroma;
    } else if (h < 300) {
        r = x;
        b = chroma;
    } else {
        r = chroma;
        b = x;
    }

    const toHex = (value: number) =>
        Math.round((value + match) * 255)
            .toString(16)
            .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Resolve a product color name (e.g. "Mint Blue") to a display hex/CSS color.
 * Never uses the raw name as CSS — multi-word names like "mint blue" are invalid.
 */
export function getColorValue(color?: string | null): string {
    const raw = (color || "").trim();
    if (!raw) {
        return "#d1d5db";
    }

    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) {
        return raw;
    }
    if (/^rgba?\(/i.test(raw) || /^hsla?\(/i.test(raw)) {
        return raw;
    }

    const normalized = normalizeColorKey(raw);
    const compact = compactColorKey(raw);

    if (COLOR_MAP[normalized]) {
        return COLOR_MAP[normalized];
    }
    if (COLOR_MAP[compact]) {
        return COLOR_MAP[compact];
    }
    if (CSS_NAMED_COLORS.has(compact)) {
        return compact;
    }

    // Prefer more specific compound matches over falling back to a base word
    // that would make "Mint Blue" look like plain blue.
    const tokens = normalized.split(" ").filter(Boolean);
    for (let length = tokens.length; length >= 2; length -= 1) {
        for (let start = 0; start <= tokens.length - length; start += 1) {
            const phrase = tokens.slice(start, start + length).join(" ");
            if (COLOR_MAP[phrase]) {
                return COLOR_MAP[phrase];
            }
            const phraseCompact = phrase.replace(/\s+/g, "");
            if (COLOR_MAP[phraseCompact]) {
                return COLOR_MAP[phraseCompact];
            }
            if (CSS_NAMED_COLORS.has(phraseCompact)) {
                return phraseCompact;
            }
        }
    }

    return hashColorToHex(normalized);
}
