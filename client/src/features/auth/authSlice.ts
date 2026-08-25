import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthState, User } from "./types";
const STORAGE_KEY = "ecommerce_auth";
type JwtPayload = {
    userId: string;
    tenantId: string | null;
    email: string;
    role: string;
    name: string;
    exp: number;
};
const decodeToken = (accessToken: string): JwtPayload | null => {
    try {
        const parts = accessToken.split(".");
        if (parts.length !== 3) {
            return null;
        }
        const payload = parts[1];
        if (!payload) {
            return null;
        }
        const base64 = payload
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const padded = base64.padEnd(base64.length +
            ((4 - (base64.length % 4)) % 4), "=");
        return JSON.parse(atob(padded)) as JwtPayload;
    }
    catch (error) {
        console.error("Failed to decode access token:", error);
        return null;
    }
};
const getUserFromToken = (accessToken: string): User | null => {
    const payload = decodeToken(accessToken);
    if (!payload) {
        return null;
    }
    return {
        _id: payload.userId,
        tenantId: payload.tenantId ?? null,
        email: payload.email,
        role: payload.role,
        name: payload.name,
        exp: payload.exp,
    } as User;
};
const getInitialState = (): AuthState => {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log("STORED AUTH:", stored);
    if (!stored) {
        return {
            user: null,
            accessToken: null,
            isAuthenticated: false,
        };
    }
    try {
        const parsed = JSON.parse(stored);
        const accessToken = parsed.accessToken ?? null;
        if (!accessToken) {
            localStorage.removeItem(STORAGE_KEY);
            return {
                user: null,
                accessToken: null,
                isAuthenticated: false,
            };
        }
        const user = parsed.user ??
            getUserFromToken(accessToken);
        if (!user) {
            localStorage.removeItem(STORAGE_KEY);
            return {
                user: null,
                accessToken: null,
                isAuthenticated: false,
            };
        }
        const payload = decodeToken(accessToken);
        if (payload?.exp &&
            payload.exp * 1000 <
                Date.now()) {
            console.log("Access token expired.");
            localStorage.removeItem(STORAGE_KEY);
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
    }
    catch (error) {
        console.error("Invalid stored auth:", error);
        localStorage.removeItem(STORAGE_KEY);
        return {
            user: null,
            accessToken: null,
            isAuthenticated: false,
        };
    }
};
const initialState = getInitialState();
const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        loginSuccess: (state, action: PayloadAction<{
            user: User;
            accessToken: string;
        }>) => {
            const { user, accessToken, } = action.payload;
            console.log("LOGIN SUCCESS:", {
                user,
                accessToken,
            });
            state.user = user;
            state.accessToken =
                accessToken;
            state.isAuthenticated = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                user,
                accessToken,
            }));
            console.log("AUTH SAVED:", localStorage.getItem(STORAGE_KEY));
        },
        logout: (state) => {
            state.user = null;
            state.accessToken = null;
            state.isAuthenticated = false;
            localStorage.removeItem(STORAGE_KEY);
        },
    },
});
export const { loginSuccess, logout, } = authSlice.actions;
export default authSlice.reducer;
