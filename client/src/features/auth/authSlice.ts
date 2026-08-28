import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthState } from "./types";
import { clearStoredAccessToken, getStoredAccessToken, getUserFromAccessToken, setStoredAccessToken, } from "./token";
const getInitialState = (): AuthState => {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
        return {
            user: null,
            accessToken: null,
            isAuthenticated: false,
        };
    }
    const user = getUserFromAccessToken(accessToken);
    if (!user) {
        clearStoredAccessToken();
        return {
            user: null,
            accessToken: null,
            isAuthenticated: false,
        };
    }
    return {
        user,
        accessToken,
        isAuthenticated: true,
    };
};
const initialState = getInitialState();
const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        loginSuccess: (state, action: PayloadAction<{
            accessToken: string;
        }>) => {
            const { accessToken } = action.payload;
            const user = getUserFromAccessToken(accessToken);
            if (!user) {
                return;
            }
            state.user = user;
            state.accessToken = accessToken;
            state.isAuthenticated = true;
            setStoredAccessToken(accessToken);
        },
        logout: (state) => {
            state.user = null;
            state.accessToken = null;
            state.isAuthenticated = false;
            clearStoredAccessToken();
        },
    },
});
export const { loginSuccess, logout, } = authSlice.actions;
export default authSlice.reducer;
