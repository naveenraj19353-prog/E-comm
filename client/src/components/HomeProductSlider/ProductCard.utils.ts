const COLOR_MAP: Record<string, string> = {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#eab308",
    black: "#111827",
    white: "#ffffff",
    grey: "#9ca3af",
    gray: "#9ca3af",
    beige: "#d6c2a1",
    pink: "#ec4899",
    purple: "#a855f7",
    orange: "#f97316",
    brown: "#92400e",
    navy: "#1e3a8a",
};

export function getColorValue(color: string): string {
    return COLOR_MAP[color.toLowerCase().trim()] ?? "#d1d5db";
}
