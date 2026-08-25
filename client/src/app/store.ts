import { configureStore } from "@reduxjs/toolkit";
import tenantReducer from "../features/tenant/tenantSlice";
import productReducer from "../features/products/productSlice";
import cartReducer from "../features/cart/cartSlice";
import authReducer from "../features/auth/authSlice";
export const store = configureStore({
    reducer: {
        tenant: tenantReducer,
        products: productReducer,
        cart: cartReducer,
        auth: authReducer,
    },
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
