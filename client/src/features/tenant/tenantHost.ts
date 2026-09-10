const RESERVED_SUBDOMAINS = new Set([
    "www",
    "admin",
    "api",
    "app",
    "beta",
    "staging",
    "mail",
    "cdn",
]);

export function getRootDomain(): string {
    return (import.meta.env.VITE_ROOT_DOMAIN?.trim() || "retailcosmos.com").toLowerCase();
}

function normalizeHost(hostname?: string): string {
    return (hostname || window.location.hostname).toLowerCase().split(":")[0];
}

/**
 * shopsphere.retailcosmos.com → "shopsphere"
 * www.retailcosmos.com / retailcosmos.com / netlify → null
 * shopsphere.localhost → "shopsphere" (local subdomain testing)
 */
export function getTenantSlugFromHostname(hostname?: string): string | null {
    const host = normalizeHost(hostname);
    const root = getRootDomain();

    if (host === root || host === `www.${root}`) {
        return null;
    }

    if (host.endsWith(`.${root}`)) {
        const sub = host.slice(0, -(root.length + 1));
        if (!sub || sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) {
            return null;
        }
        return sub;
    }

    if (host.endsWith(".localhost")) {
        const sub = host.replace(/\.localhost$/, "");
        if (sub && !sub.includes(".") && !RESERVED_SUBDOMAINS.has(sub)) {
            return sub;
        }
    }

    return null;
}

export function isOnTenantSubdomain(hostname?: string): boolean {
    return Boolean(getTenantSlugFromHostname(hostname));
}

/**
 * Prefer tenant subdomains on the production root domain.
 * Keep path mode on localhost / Netlify / Vercel betas.
 */
export function useSubdomainStorefrontUrls(hostname?: string): boolean {
    const mode = (import.meta.env.VITE_TENANT_ROUTING || "auto").trim().toLowerCase();
    if (mode === "path") {
        return false;
    }
    if (mode === "subdomain") {
        return true;
    }

    const host = normalizeHost(hostname);
    if (
        host === "localhost"
        || host === "127.0.0.1"
        || host.endsWith(".netlify.app")
        || host.endsWith(".vercel.app")
        || host.endsWith(".amplifyapp.com")
    ) {
        return false;
    }

    const root = getRootDomain();
    return host === root || host === `www.${root}` || host.endsWith(`.${root}`);
}

export function getStorefrontOrigin(slug: string, hostname?: string): string {
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug) {
        return window.location.origin;
    }

    if (!useSubdomainStorefrontUrls(hostname)) {
        return window.location.origin;
    }

    const protocol = window.location.protocol === "http:" ? "http:" : "https:";
    const root = getRootDomain();
    // Local subdomain testing: shopsphere.localhost:5173
    if (normalizeHost(hostname) === "localhost" || normalizeHost(hostname).endsWith(".localhost")) {
        const port = window.location.port ? `:${window.location.port}` : "";
        return `${protocol}//${cleanSlug}.localhost${port}`;
    }
    return `${protocol}//${cleanSlug}.${root}`;
}

/** Absolute or same-origin href for a storefront path. */
export function getStorefrontHref(slug: string, path = "/"): string {
    const cleanSlug = slug.trim().toLowerCase();
    const suffix = !path || path === "/" ? "" : (path.startsWith("/") ? path : `/${path}`);
    const hostSlug = getTenantSlugFromHostname();

    // Already on this tenant's subdomain → relative path
    if (hostSlug && hostSlug === cleanSlug) {
        return suffix || "/";
    }

    if (useSubdomainStorefrontUrls()) {
        return `${getStorefrontOrigin(cleanSlug)}${suffix || ""}`;
    }

    return `/${cleanSlug}${suffix}`;
}

/** Display label for admin UI, e.g. shopsphere.retailcosmos.com */
export function formatStorefrontHost(slug: string): string {
    const cleanSlug = (slug || "your-store").trim().toLowerCase() || "your-store";
    if (useSubdomainStorefrontUrls()) {
        return `${cleanSlug}.${getRootDomain()}`;
    }
    return `/${cleanSlug}`;
}
