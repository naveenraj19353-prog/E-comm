import axios, { type InternalAxiosRequestConfig } from "axios";
import { store } from "../app/store";
import { API_BASE_URL } from "../constants/api";
import { logout } from "../features/auth/authSlice";
import { getStoredAccessToken, type AuthSlot } from "../features/auth/token";

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

type AuthMeta = {
    __authSlot?: AuthSlot;
    __authToken?: string;
};

const clean = (value?: string | null) => String(value || "").trim().toLowerCase();

/**
 * Sends the session for the page being viewed: this store's customer on a
 * storefront, the admin session in the admin panel. Storefront requests
 * also carry `X-Tenant-Id` so the API can refuse another store's session.
 */
apiClient.interceptors.request.use((config) => {
    const state = store.getState();
    const slot = state.auth.slot;
    const accessToken = getStoredAccessToken(slot);
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
        const meta = config as InternalAxiosRequestConfig & AuthMeta;
        meta.__authSlot = slot;
        meta.__authToken = accessToken;
    }
    if (slot.kind === "store") {
        const tenant = state.tenant.currentTenant;
        if (tenant?.tenantId && clean(tenant.slug) === slot.slug) {
            config.headers["X-Tenant-Id"] = tenant.tenantId;
        }
    }
    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const meta = (error.config || {}) as AuthMeta & { url?: string };
            const isAuthEndpoint = String(meta.url || "").startsWith("/auth/");
            // Only drop the session that was actually rejected, and only if it
            // hasn't been replaced by a new sign-in since the request started.
            if (meta.__authToken && meta.__authSlot && !isAuthEndpoint) {
                store.dispatch(logout({ slot: meta.__authSlot, ifToken: meta.__authToken }));
            }
        }
        return Promise.reject(error);
    },
);

export default apiClient;
