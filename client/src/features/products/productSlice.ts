import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
export interface ProductFilters {
    categories: string[];
    colors: string[];
    sizes: string[];
    priceRange: number[];
    rating: number | null;
    sort: string;
    search: string;
}
interface ProductState {
    filters: ProductFilters;
}
const getInitialFilters = (): ProductFilters => ({
    categories: [],
    colors: [],
    sizes: [],
    priceRange: [0, 100000],
    rating: null,
    sort: "newest",
    search: "",
});
const initialState: ProductState = {
    filters: getInitialFilters(),
};
const productSlice = createSlice({
    name: "products",
    initialState,
    reducers: {
        setFilters(state, action: PayloadAction<Partial<ProductFilters>>) {
            state.filters = {
                ...state.filters,
                ...action.payload,
            };
        },
        clearFilters(state) {
            state.filters = getInitialFilters();
        },
        clearCategoryFilter(state) {
            state.filters.categories = [];
        },
        clearSearchFilter(state) {
            state.filters.search = "";
        },
    },
});
export const { setFilters, clearFilters, clearCategoryFilter, clearSearchFilter, } = productSlice.actions;
export default productSlice.reducer;
