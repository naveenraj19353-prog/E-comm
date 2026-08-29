export const DEFAULT_MIN_PRICE = 0;
export const DEFAULT_MAX_PRICE = 100000;

export const isActivePriceFilter = (
    priceRange: number[],
    catalogMin?: number,
    catalogMax?: number,
): boolean => {
    if (catalogMin !== undefined && catalogMax !== undefined) {
        return priceRange[0] > catalogMin || priceRange[1] < catalogMax;
    }
    return (priceRange[0] !== DEFAULT_MIN_PRICE ||
        priceRange[1] !== DEFAULT_MAX_PRICE);
};

export const getApiPriceBounds = (priceRange: number[], catalogMin?: number, catalogMax?: number,) => {
    if (!isActivePriceFilter(priceRange, catalogMin, catalogMax)) {
        return {};
    }
    return {
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
    };
};
