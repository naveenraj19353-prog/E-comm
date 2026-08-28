import { configureStore } from "@reduxjs/toolkit";
import tenantReducer from "../features/tenant/tenantSlice";
import productReducer from "../features/products/productSlice";
import cartReducer from "../features/cart/cartSlice";
import authReducer from "../features/auth/authSlice";
import themeCustomizerReducer from "../features/theme/themeCustomizerSlice";
export const store = configureStore({
    reducer: {
        tenant: tenantReducer,
        products: productReducer,
        cart: cartReducer,
        auth: authReducer,
        themeCustomizer: themeCustomizerReducer,
    },
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
