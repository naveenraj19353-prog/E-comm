import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthState, User } from "./types";
const STORAGE_KEY = "ecommerce_auth";
// ==========================================================
// JWT PAYLOAD
// ==========================================================
type JwtPayload = {
  userId: string;
  tenantId: string | null;
  email: string;
  role: string;
  name: string;
  exp: number;
};
// ==========================================================
// DECODE JWT
// ==========================================================
const decodeToken = (
  accessToken: string,
): JwtPayload | null => {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const payload = parts[1];
    if (!payload) {
      return null;
    }
    /*
     * JWT uses base64url.
     * Convert it to normal base64 before decoding.
     */
    const base64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length +
        ((4 - (base64.length % 4)) % 4),
      "=",
    );
    return JSON.parse(
      atob(padded),
    ) as JwtPayload;
  } catch (error) {
    console.error(
      "Failed to decode access token:",
      error,
    );
    return null;
  }
};
// ==========================================================
// GET USER FROM TOKEN
// ==========================================================
const getUserFromToken = (
  accessToken: string,
): User | null => {
  const payload =
    decodeToken(accessToken);
  if (!payload) {
    return null;
  }
  return {
    _id: payload.userId,
    tenantId:
      payload.tenantId ?? null,
    email: payload.email,
    role: payload.role,
    name: payload.name,
    exp: payload.exp,
  } as User;
};
// ==========================================================
// INITIAL STATE
// ==========================================================
const getInitialState = (): AuthState => {
  const stored =
    localStorage.getItem(
      STORAGE_KEY,
    );
  console.log(
    "STORED AUTH:",
    stored,
  );
  // --------------------------------------------------------
  // No stored authentication
  // --------------------------------------------------------
  if (!stored) {
    return {
      user: null,
      accessToken: null,
      isAuthenticated: false,
    };
  }
  try {
    const parsed =
      JSON.parse(stored);
    const accessToken =
      parsed.accessToken ?? null;
    // ------------------------------------------------------
    // Token missing
    // ------------------------------------------------------
    if (!accessToken) {
      localStorage.removeItem(
        STORAGE_KEY,
      );
      return {
        user: null,
        accessToken: null,
        isAuthenticated: false,
      };
    }
    // ------------------------------------------------------
    // Get stored user
    //
    // If user doesn't exist, decode from JWT.
    // ------------------------------------------------------
    const user =
      parsed.user ??
      getUserFromToken(
        accessToken,
      );
    // ------------------------------------------------------
    // User missing
    // ------------------------------------------------------
    if (!user) {
      localStorage.removeItem(
        STORAGE_KEY,
      );
      return {
        user: null,
        accessToken: null,
        isAuthenticated: false,
      };
    }
    // ------------------------------------------------------
    // Optional token expiry check
    // ------------------------------------------------------
    const payload =
      decodeToken(accessToken);
    if (
      payload?.exp &&
      payload.exp * 1000 <
        Date.now()
    ) {
      console.log(
        "Access token expired.",
      );
      localStorage.removeItem(
        STORAGE_KEY,
      );
      return {
        user: null,
        accessToken: null,
        isAuthenticated: false,
      };
    }
    // ------------------------------------------------------
    // Valid authentication
    // ------------------------------------------------------
    return {
      user,
      accessToken,
      isAuthenticated: true,
    };
  } catch (error) {
    console.error(
      "Invalid stored auth:",
      error,
    );
    localStorage.removeItem(
      STORAGE_KEY,
    );
    return {
      user: null,
      accessToken: null,
      isAuthenticated: false,
    };
  }
};
// ==========================================================
// INITIAL STATE
// ==========================================================
const initialState =
  getInitialState();
// ==========================================================
// AUTH SLICE
// ==========================================================
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    // ======================================================
    // LOGIN SUCCESS
    // ======================================================
    loginSuccess: (
      state,
      action: PayloadAction<{
        user: User;
        accessToken: string;
      }>,
    ) => {
      const {
        user,
        accessToken,
      } = action.payload;
      console.log(
        "LOGIN SUCCESS:",
        {
          user,
          accessToken,
        },
      );
      // ----------------------------------------------------
      // Redux state
      // ----------------------------------------------------
      state.user = user;
      state.accessToken =
        accessToken;
      state.isAuthenticated = true;
      // ----------------------------------------------------
      // Local storage
      //
      // IMPORTANT:
      // Store BOTH user and accessToken.
      // ----------------------------------------------------
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user,
          accessToken,
        }),
      );
      console.log(
        "AUTH SAVED:",
        localStorage.getItem(
          STORAGE_KEY,
        ),
      );
    },
    // ======================================================
    // LOGOUT
    // ======================================================
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      localStorage.removeItem(
        STORAGE_KEY,
      );
    },
  },
});
// ==========================================================
// EXPORT
// ==========================================================
export const {
  loginSuccess,
  logout,
} = authSlice.actions;
export default authSlice.reducer;
