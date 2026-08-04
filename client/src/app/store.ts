import { configureStore } from "@reduxjs/toolkit";

import tenantReducer from "../features/tenant/tenantSlice";
import productReducer from "../features/products/productSlice";

export const store = configureStore({
  reducer: {
    tenant: tenantReducer,
    products: productReducer,
  },
});

export type RootState = ReturnType<
  typeof store.getState
>;

export type AppDispatch = typeof store.dispatch;