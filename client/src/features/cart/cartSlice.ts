import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
interface CartState {
    count: number;
}
const initialState: CartState = {
    count: 0,
};
const cartSlice = createSlice({
    name: "cart",
    initialState,
    reducers: {
        setCartCount: (state, action: PayloadAction<number>) => {
            state.count = action.payload;
        },
        incrementCartCount: (state, action: PayloadAction<number | undefined>) => {
            state.count += action.payload ?? 1;
        },
        decrementCartCount: (state, action: PayloadAction<number | undefined>) => {
            state.count = Math.max(0, state.count - (action.payload ?? 1));
        },
        clearCartCount: (state) => {
            state.count = 0;
        },
    },
});
export const { setCartCount, incrementCartCount, decrementCartCount, clearCartCount, } = cartSlice.actions;
export default cartSlice.reducer;
