export const DEFAULT_MIN_PRICE = 0;
export const DEFAULT_MAX_PRICE = 100000;

const isUnsetDefaultPriceRange = (priceRange: number[]): boolean =>
    priceRange[0] === DEFAULT_MIN_PRICE && priceRange[1] === DEFAULT_MAX_PRICE;

export const isActivePriceFilter = (
    priceRange: number[],
    catalogMin?: number,
    catalogMax?: number,
): boolean => {
    // Initial Redux default — never treat as a user-applied filter on load.
    if (isUnsetDefaultPriceRange(priceRange)) {
        return false;
    }
    if (catalogMin !== undefined && catalogMax !== undefined) {
        // Full catalog span (or wider) means no price filter.
        if (priceRange[0] <= catalogMin && priceRange[1] >= catalogMax) {
            return false;
        }
        return true;
    }
    return true;
};

export const getApiPriceBounds = (
    priceRange: number[],
    catalogMin?: number,
    catalogMax?: number,
) => {
    if (!isActivePriceFilter(priceRange, catalogMin, catalogMax)) {
        return {};
    }
    return {
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
    };
};
