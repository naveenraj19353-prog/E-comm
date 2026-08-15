import type { RootState } from "../../app/store";
export const selectProductFilters = (state: RootState) =>
  state.products.filters;
