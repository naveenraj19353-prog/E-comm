export const CATEGORY_SLIDER_MOBILE_QUERY = "(max-width: 37.5rem)";
export const DESKTOP_VISIBLE_COUNT = 5;
export const DESKTOP_SLIDE_COUNT = 3;
export const AUTO_SLIDE_INTERVAL = 3000;

export function formatCategoryName(name: string): string {
    return name
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function clampIndex(index: number, maxIndex: number): number {
    return Math.max(0, Math.min(index, maxIndex));
}

export function getNextSliderIndex(
    currentIndex: number,
    maxIndex: number,
    slideCount: number,
): number {
    if (currentIndex >= maxIndex) {
        return 0;
    }
    return Math.min(maxIndex, currentIndex + slideCount);
}

export function getPreviousSliderIndex(
    currentIndex: number,
    maxIndex: number,
    slideCount: number,
): number {
    if (currentIndex === 0) {
        return maxIndex;
    }
    return Math.max(0, currentIndex - slideCount);
}
