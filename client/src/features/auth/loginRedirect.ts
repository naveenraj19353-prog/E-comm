import type { Location } from "react-router-dom";
import type { User } from "./types";
import { getTenantSlugFromHostname } from "../tenant/tenantHost";
import { routes } from "../../routes/routes";

export type LoginLocationState = {
    from?: string;
    message?: string;
};

export function getReturnPath(location: Pick<Location, "pathname" | "search" | "hash">): string {
    return `${location.pathname}${location.search}${location.hash}`;
}

export function getStorefrontLoginPath(tenantSlug?: string): string {
    if (!tenantSlug) {
        return "/login";
    }
    return routes.login(tenantSlug);
}

export function readLoginReturnPath(state: unknown): string {
    if (typeof state === "object" && state && "from" in state && typeof state.from === "string") {
        return state.from;
    }
    return "";
}

export function isStorefrontReturnPath(path: string, tenantSlug: string): boolean {
    if (!path || !tenantSlug) {
        return false;
    }

    // Subdomain mode: paths are /products, /cart, etc. (no slug prefix)
    if (getTenantSlugFromHostname()) {
        if (path === "/" || path.startsWith("/?")) {
            return true;
        }
        if (path.startsWith("/login") || path.startsWith("/register")) {
            return false;
        }
        if (path.startsWith("/admin")) {
            return false;
        }
        return path.startsWith("/");
    }

    const base = `/${tenantSlug}`;
    if (path === base) {
        return true;
    }
    if (!path.startsWith(`${base}/`)) {
        return false;
    }
    if (path.startsWith(`${base}/login`) || path.startsWith(`${base}/register`)) {
        return false;
    }
    return true;
}

export function resolveStorefrontReturnPath(from: string | undefined, tenantSlug: string): string {
    if (from && isStorefrontReturnPath(from, tenantSlug)) {
        return from;
    }
    return routes.home(tenantSlug);
}

export function getLoginLocationState(from: string, message?: string): LoginLocationState {
    return message ? { from, message } : { from };
}

export function resolvePostLoginPath(
    user: User | null,
    from: string,
    tenantSlug: string,
): string {
    if (!user) {
        return routes.home(tenantSlug);
    }
    if (user.role === "super_admin") {
        return "/admin";
    }
    if (user.role === "admin" && user.tenantId) {
        return `/admin/tenants/${user.tenantId}`;
    }
    return resolveStorefrontReturnPath(from, tenantSlug);
}

export function resolveLoginReturnPath(
    returnPath: string | undefined,
    location: Pick<Location, "pathname" | "search" | "hash">,
    state: unknown,
): string {
    return returnPath ||
        readLoginReturnPath(state) ||
        getReturnPath(location);
}
