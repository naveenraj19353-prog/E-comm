import type { AuthSlotState, User } from "./types";
import { getTenantSlugFromHostname } from "../tenant/tenantHost";

/**
 * Sessions are stored per context so that, in path mode (every store on one
 * origin), signing in to store A doesn't sign you in to store B, and the
 * admin panel keeps its own login:
 *
 *   ecommerce_auth:store:<slug>  storefront customer session for one store
 *   ecommerce_auth:admin         admin panel (store owner, manager, super admin)
 *
 * The old single `ecommerce_auth` key is migrated once, then removed.
 */
const LEGACY_STORAGE_KEY = "ecommerce_auth";
const ADMIN_STORAGE_KEY = "ecommerce_auth:admin";
const STORE_STORAGE_PREFIX = "ecommerce_auth:store:";

export type AuthSlot = AuthSlotState;

type JwtPayload = {
    userId: string;
    tenantId: string | null;
    email: string;
    role: string;
    name: string;
    phone?: string;
    counterNumber?: string;
    permissions?: Record<string, boolean>;
    exp: number;
};

/** First path segments that belong to the platform, not to a store. */
const PLATFORM_SEGMENTS = new Set([
    "admin",
    "create-store",
    "welcome-alt",
    "legal",
    "login",
    "register",
    "logout",
]);

const STAFF_ROLES = new Set(["admin", "store_manager", "super_admin"]);

const looksLikeJwt = (value: string): boolean => value.split(".").length === 3;

const safeStorage = {
    get(key: string): string | null {
        try {
            return window.localStorage.getItem(key);
        }
        catch {
            return null;
        }
    },
    set(key: string, value: string): void {
        try {
            window.localStorage.setItem(key, value);
        }
        catch {
            // Storage unavailable (private mode / blocked): session lasts for this page only.
        }
    },
    remove(key: string): void {
        try {
            window.localStorage.removeItem(key);
        }
        catch {
            // ignore
        }
    },
    keys(): string[] {
        try {
            return Object.keys(window.localStorage);
        }
        catch {
            return [];
        }
    },
};

export const decodeAccessToken = (accessToken: string): JwtPayload | null => {
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
    catch {
        return null;
    }
};

export const getUserFromAccessToken = (accessToken: string): User | null => {
    const payload = decodeAccessToken(accessToken);
    if (!payload) {
        return null;
    }
    return {
        _id: payload.userId,
        userId: payload.userId,
        tenantId: payload.tenantId ?? null,
        email: payload.email,
        role: payload.role,
        name: payload.name,
        phone: payload.phone,
        counterNumber: payload.counterNumber,
        permissions: payload.permissions,
    };
};

export const isAccessTokenExpired = (accessToken: string): boolean => {
    const payload = decodeAccessToken(accessToken);
    if (!payload?.exp) {
        return true;
    }
    return payload.exp * 1000 < Date.now();
};

const isUsableToken = (token: string | null | undefined): token is string =>
    Boolean(token && looksLikeJwt(token) && !isAccessTokenExpired(token));

const isStaffRole = (role?: string | null): boolean => STAFF_ROLES.has(role || "");

/* ------------------------------------------------------------------ slots */

const cleanSlug = (slug: string): string => slug.trim().toLowerCase();

export const adminSlot = (): AuthSlot => ({ kind: "admin" });

export const storeSlot = (slug: string): AuthSlot => ({ kind: "store", slug: cleanSlug(slug) });

export const slotStorageKey = (slot: AuthSlot): string =>
    slot.kind === "admin"
        ? ADMIN_STORAGE_KEY
        : `${STORE_STORAGE_PREFIX}${slot.slug}`;

export const sameSlot = (a: AuthSlot, b: AuthSlot): boolean =>
    slotStorageKey(a) === slotStorageKey(b);

/**
 * Which session the page at `pathname` uses.
 * - `/admin/...` and platform pages → admin session
 * - `/:slug/customize` (layout studio) → admin session (it's a staff tool)
 * - any other storefront page → that store's customer session
 */
export const getAuthSlotForLocation = (
    pathname: string = window.location.pathname,
    hostname?: string,
): AuthSlot => {
    const segments = pathname.split("/").filter(Boolean);
    const first = (segments[0] || "").toLowerCase();
    const hostSlug = getTenantSlugFromHostname(hostname);

    if (hostSlug) {
        if (first === "admin" || first === "customize" || first === "logout") {
            return adminSlot();
        }
        return storeSlot(hostSlug);
    }
    if (!first || PLATFORM_SEGMENTS.has(first)) {
        return adminSlot();
    }
    if ((segments[1] || "").toLowerCase() === "customize") {
        return adminSlot();
    }
    let slug = first;
    try {
        slug = decodeURIComponent(first);
    }
    catch {
        // keep raw segment
    }
    return storeSlot(slug);
};

export const getCurrentAuthSlot = (): AuthSlot => getAuthSlotForLocation();

/* -------------------------------------------------------------- migration */

let migrated = false;

/** Move a token saved under the old single key into its per-context slot (once). */
export const migrateLegacyToken = (): void => {
    if (migrated) {
        return;
    }
    migrated = true;
    const stored = safeStorage.get(LEGACY_STORAGE_KEY);
    if (stored === null) {
        return;
    }
    let token: string | null = stored;
    if (stored.startsWith("{")) {
        try {
            token = (JSON.parse(stored) as { accessToken?: string }).accessToken ?? null;
        }
        catch {
            token = null;
        }
    }
    safeStorage.remove(LEGACY_STORAGE_KEY);
    if (!isUsableToken(token)) {
        return;
    }
    const user = getUserFromAccessToken(token);
    if (!user) {
        return;
    }
    if (isStaffRole(user.role)) {
        if (!isUsableToken(safeStorage.get(ADMIN_STORAGE_KEY))) {
            safeStorage.set(ADMIN_STORAGE_KEY, token);
        }
        return;
    }
    if (user.role === "customer" && user.tenantId) {
        // Keyed by tenantId; self-serve stores use tenantId === slug. For
        // stores where they differ, adoptTenantIdSlot() moves it once the
        // store's slug is known.
        const key = slotStorageKey(storeSlot(user.tenantId));
        if (!isUsableToken(safeStorage.get(key))) {
            safeStorage.set(key, token);
        }
    }
};

/**
 * For stores whose tenantId differs from their slug: a migrated session
 * saved under the tenantId is moved to the slug slot the first time the
 * store is opened.
 */
export const adoptTenantIdSlot = (slug: string, tenantId: string): boolean => {
    const slugKey = slotStorageKey(storeSlot(slug));
    const idKey = slotStorageKey(storeSlot(tenantId));
    if (slugKey === idKey || isUsableToken(safeStorage.get(slugKey))) {
        return false;
    }
    const token = safeStorage.get(idKey);
    if (!isUsableToken(token)) {
        return false;
    }
    const user = getUserFromAccessToken(token);
    if (user?.role !== "customer" || cleanSlug(user.tenantId || "") !== cleanSlug(tenantId)) {
        return false;
    }
    safeStorage.set(slugKey, token);
    safeStorage.remove(idKey);
    return true;
};

/* ------------------------------------------------------------ read/write */

/** Token for `slot` (defaults to the current page's context), or null. */
export const getStoredAccessToken = (slot: AuthSlot = getCurrentAuthSlot()): string | null => {
    migrateLegacyToken();
    const key = slotStorageKey(slot);
    const stored = safeStorage.get(key);
    if (!stored) {
        return null;
    }
    if (!isUsableToken(stored)) {
        safeStorage.remove(key);
        return null;
    }
    const user = getUserFromAccessToken(stored);
    // A slot only ever holds its own kind of session.
    const fits = slot.kind === "admin"
        ? isStaffRole(user?.role)
        : user?.role === "customer";
    if (!fits) {
        safeStorage.remove(key);
        return null;
    }
    return stored;
};

/**
 * Where a newly issued token belongs:
 * - staff/super admin tokens → admin slot (even when signing in on a storefront)
 * - customer tokens → the store being viewed; outside a storefront, the
 *   store's tenantId slot. Customer tokens are never saved to the admin slot.
 */
export const slotForToken = (
    accessToken: string,
    context: AuthSlot = getCurrentAuthSlot(),
): AuthSlot | null => {
    const user = getUserFromAccessToken(accessToken);
    if (!user) {
        return null;
    }
    if (isStaffRole(user.role)) {
        return adminSlot();
    }
    if (user.role !== "customer") {
        return null;
    }
    if (context.kind === "store") {
        return context;
    }
    return user.tenantId ? storeSlot(user.tenantId) : null;
};

let lastIssuedToken: string | null = null;

/** Save a token in the slot it belongs to. Returns that slot (null if not saved). */
export const setStoredAccessToken = (
    accessToken: string,
    context: AuthSlot = getCurrentAuthSlot(),
): AuthSlot | null => {
    lastIssuedToken = accessToken;
    const slot = slotForToken(accessToken, context);
    if (!slot) {
        return null;
    }
    safeStorage.set(slotStorageKey(slot), accessToken);
    return slot;
};

/** The token from the most recent sign-in on this page (any slot). */
export const getLastIssuedAccessToken = (): string | null =>
    isUsableToken(lastIssuedToken) ? lastIssuedToken : null;

export const clearStoredAccessToken = (slot: AuthSlot = getCurrentAuthSlot()): void => {
    safeStorage.remove(slotStorageKey(slot));
};

/** Sign out of everything on this browser (admin and every store). */
export const clearAllStoredAccessTokens = (): void => {
    safeStorage.remove(LEGACY_STORAGE_KEY);
    for (const key of safeStorage.keys()) {
        if (key === ADMIN_STORAGE_KEY || key.startsWith(STORE_STORAGE_PREFIX)) {
            safeStorage.remove(key);
        }
    }
};

export const isAuthStorageKey = (key: string | null): boolean =>
    key === null ||
    key === LEGACY_STORAGE_KEY ||
    key === ADMIN_STORAGE_KEY ||
    key.startsWith(STORE_STORAGE_PREFIX);
