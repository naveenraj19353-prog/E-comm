export const HOME_SECTION_IDS = [
    "banner",
    "festival",
    "categories",
    "trending",
    "discounts",
    "mostSelling",
    "newArrivals",
    "topRated",
    "dealOfTheDay",
    "testimonials",
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
    banner: "Banner",
    festival: "Festival offer",
    categories: "Categories",
    trending: "Trending products",
    discounts: "Best discounts",
    mostSelling: "Most selling",
    newArrivals: "New arrivals",
    topRated: "Top rated",
    dealOfTheDay: "Deal of the day",
    testimonials: "Testimonials",
};

export const DEFAULT_HOME_SECTION_ORDER: HomeSectionId[] = [...HOME_SECTION_IDS];

export function isHomeSectionId(value: string): value is HomeSectionId {
    return (HOME_SECTION_IDS as readonly string[]).includes(value);
}

export function normalizeHomeSectionOrder(
    order?: readonly string[] | null,
): HomeSectionId[] {
    const seen = new Set<HomeSectionId>();
    const next: HomeSectionId[] = [];
    for (const item of order || []) {
        if (!isHomeSectionId(item) || seen.has(item)) {
            continue;
        }
        seen.add(item);
        next.push(item);
    }
    for (const item of DEFAULT_HOME_SECTION_ORDER) {
        if (!seen.has(item)) {
            next.push(item);
        }
    }
    return next;
}

export function moveHomeSection(
    order: readonly string[] | null | undefined,
    index: number,
    direction: -1 | 1,
): HomeSectionId[] {
    const next = normalizeHomeSectionOrder(order);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= next.length) {
        return next;
    }
    const current = next[index];
    next[index] = next[swapWith];
    next[swapWith] = current;
    return next;
}
