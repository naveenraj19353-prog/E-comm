import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthState } from "./types";
import {
    adminSlot,
    clearAllStoredAccessTokens,
    clearStoredAccessToken,
    getAuthSlotForLocation,
    getStoredAccessToken,
    getUserFromAccessToken,
    sameSlot,
    setStoredAccessToken,
    type AuthSlot,
} from "./token";

/**
 * `user` / `accessToken` are the session of the context being viewed: the
 * current store's customer on a storefront, or the admin panel's staff user.
 * `staffUser` is always the admin-panel session, so storefront pages can
 * still show staff tools (e.g. the layout studio button) without treating
 * the owner as a signed-in shopper.
 */
const readSession = (slot: AuthSlot): AuthState => {
    const accessToken = getStoredAccessToken(slot);
    const user = accessToken ? getUserFromAccessToken(accessToken) : null;
    if (accessToken && !user) {
        clearStoredAccessToken(slot);
    }
    const staffToken = slot.kind === "admin"
        ? (user ? accessToken : null)
        : getStoredAccessToken(adminSlot());
    const staffUser = staffToken ? getUserFromAccessToken(staffToken) : null;
    return {
        user,
        accessToken: user ? accessToken : null,
        isAuthenticated: Boolean(user),
        slot,
        staffUser,
    };
};

const initialState: AuthState = readSession(getAuthSlotForLocation());

export type LogoutOptions = {
    /** Sign out of this slot instead of the one being viewed. */
    slot?: AuthSlot;
    /** Only sign out if this is still the slot's token (ignore stale 401s). */
    ifToken?: string;
    /** Sign out of the admin panel and every store. */
    all?: boolean;
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        loginSuccess: (state, action: PayloadAction<{
            accessToken: string;
        }>) => {
            const { accessToken } = action.payload;
            if (!getUserFromAccessToken(accessToken)) {
                return;
            }
            setStoredAccessToken(accessToken, state.slot);
            return readSession(state.slot);
        },
        logout: (state, action: PayloadAction<LogoutOptions | undefined>) => {
            const options = action.payload ?? {};
            if (options.all) {
                clearAllStoredAccessTokens();
                return readSession(state.slot);
            }
            const slot = options.slot ?? state.slot;
            if (options.ifToken && getStoredAccessToken(slot) !== options.ifToken) {
                return;
            }
            clearStoredAccessToken(slot);
            return readSession(state.slot);
        },
        /** Re-read the session for the page being viewed (navigation, other tabs). */
        syncAuthSession: (state, action: PayloadAction<{ pathname?: string } | undefined>) => {
            const slot = action.payload?.pathname !== undefined
                ? getAuthSlotForLocation(action.payload.pathname)
                : state.slot;
            const next = readSession(slot);
            if (
                sameSlot(slot, state.slot) &&
                next.accessToken === state.accessToken &&
                (next.staffUser?._id ?? null) === (state.staffUser?._id ?? null)
            ) {
                return;
            }
            return next;
        },
    },
});
export const { loginSuccess, logout, syncAuthSession, } = authSlice.actions;
export default authSlice.reducer;
