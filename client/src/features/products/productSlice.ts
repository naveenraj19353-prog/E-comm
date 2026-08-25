import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ProductFilter } from "./types";

export interface ProductFilters {
  categories: string[];
  colors: string[];
  sizes: string[];
  brands: string[];
  priceRange: number[];
  rating: number | null;
  sort: string;
  search: string;
}

interface ProductState {
  filters: ProductFilters;
  catalogFilter: ProductFilter | null;
}

const getInitialFilters = (): ProductFilters => ({
  categories: [],
  colors: [],
  sizes: [],
  brands: [],
  priceRange: [0, 100000],
  rating: null,
  sort: "newest",
  search: "",
});

const initialState: ProductState = {
  filters: getInitialFilters(),
  catalogFilter: null,
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
    setCatalogFilter(state, action: PayloadAction<ProductFilter | null>) {
      state.catalogFilter = action.payload;
    },
    clearFilters(state) {
      const price = state.catalogFilter?.price;
      state.filters = {
        ...getInitialFilters(),
        priceRange: price
          ? [price.min, Math.max(price.max, price.min)]
          : getInitialFilters().priceRange,
      };
    },
    clearCategoryFilter(state) {
      state.filters.categories = [];
    },
    clearSearchFilter(state) {
      state.filters.search = "";
    },
  },
});

export const {
  setFilters,
  setCatalogFilter,
  clearFilters,
  clearCategoryFilter,
  clearSearchFilter,
} = productSlice.actions;
export default productSlice.reducer;
