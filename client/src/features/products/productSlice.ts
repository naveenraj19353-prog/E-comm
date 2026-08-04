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

const initialState: ProductState = {
  filters: {
    categories: [],
    colors: [],
    sizes: [],
    priceRange: [0, 100000],
    rating: null,
    sort: "newest",
    search: "",
  },
};

const productSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    setFilters(
      state,
      action: PayloadAction<Partial<ProductFilters>>
    ) {
      state.filters = {
        ...state.filters,
        ...action.payload,
      };
    },

    clearFilters(state) {
      state.filters = initialState.filters;
    },
  },
});

export const {
  setFilters,
  clearFilters,
} = productSlice.actions;

export default productSlice.reducer;