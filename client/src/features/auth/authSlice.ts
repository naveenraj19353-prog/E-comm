import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AuthState, User } from "./types";

const STORAGE_KEY = "ecommerce_auth";

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

    return {
      user: parsed.user ?? null,
      accessToken: parsed.accessToken ?? null,
      isAuthenticated: !!parsed.user && !!parsed.accessToken,
    };
  } catch (error) {
    console.error("Invalid stored auth:", error);

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
    loginSuccess: (
      state,
      action: PayloadAction<{
        user: User;
        accessToken: string;
      }>
    ) => {
      const { user, accessToken } = action.payload;

      console.log("LOGIN SUCCESS:", {
        user,
        accessToken,
      });

      state.user = user;
      state.accessToken = accessToken;
      state.isAuthenticated = true;

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user,
          accessToken,
        })
      );

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

export const { loginSuccess, logout } = authSlice.actions;

export default authSlice.reducer;
