import type { User } from "./types";

const STORAGE_KEY = "ecommerce_auth";

type JwtPayload = {
    userId: string;
    tenantId: string | null;
    email: string;
    role: string;
    name: string;
    exp: number;
};

const looksLikeJwt = (value: string): boolean => value.split(".").length === 3;

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
    };
};

export const isAccessTokenExpired = (accessToken: string): boolean => {
    const payload = decodeAccessToken(accessToken);
    if (!payload?.exp) {
        return true;
    }
    return payload.exp * 1000 < Date.now();
};

export const getStoredAccessToken = (): string | null => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        return null;
    }
    if (stored.startsWith("{")) {
        try {
            const parsed = JSON.parse(stored) as {
                accessToken?: string;
            };
            const token = parsed.accessToken ?? null;
            if (token && looksLikeJwt(token) && !isAccessTokenExpired(token)) {
                localStorage.setItem(STORAGE_KEY, token);
                return token;
            }
        }
        catch {
            console.log("error")
        }
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
    if (!looksLikeJwt(stored)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
    if (isAccessTokenExpired(stored)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
    return stored;
};

export const setStoredAccessToken = (accessToken: string): void => {
    localStorage.setItem(STORAGE_KEY, accessToken);
};

export const clearStoredAccessToken = (): void => {
    localStorage.removeItem(STORAGE_KEY);
};
