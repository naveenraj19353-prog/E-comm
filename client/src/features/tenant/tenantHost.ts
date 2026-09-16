const RESERVED_SUBDOMAINS = new Set([
    "www",
    "admin",
    "api",
    "app",
    "beta",
    "staging",
    "mail",
    "cdn",
    "store",
]);

/** Apex marketing domain, e.g. retailcosmos.com */
export function getRootDomain(): string {
    return (import.meta.env.VITE_ROOT_DOMAIN?.trim() || "retailcosmos.com").toLowerCase();
}

/**
 * Tenant storefront base, e.g. retailcosmos.com
 * → https://test21.retailcosmos.com
 */
export function getTenantBaseDomain(): string {
    const explicit = import.meta.env.VITE_TENANT_BASE_DOMAIN?.trim();
    if (explicit) {
        return explicit.toLowerCase();
    }
    return getRootDomain();
}

export function getPublicSiteHost(): string {
    const configured =
        import.meta.env.VITE_PUBLIC_SITE_URL?.trim() ||
        "https://app.retailcosmos.com";
    try {
        return new URL(configured).hostname.toLowerCase();
    } catch {
        return "app.retailcosmos.com";
    }
}

function normalizeHost(hostname?: string): string {
    return (hostname || window.location.hostname).toLowerCase().split(":")[0];
}

/**
 * test21.retailcosmos.com → "test21"
 * app.retailcosmos.com / www.retailcosmos.com / retailcosmos.com → null
 * test.localhost → "test" (local subdomain testing)
 */
export function getTenantSlugFromHostname(hostname?: string): string | null {
    const host = normalizeHost(hostname);
    const root = getRootDomain();
    const tenantBase = getTenantBaseDomain();

    if (
        host === root
        || host === `www.${root}`
        || host === tenantBase
        || host === `www.${tenantBase}`
    ) {
        return null;
    }

    if (host.endsWith(`.${tenantBase}`)) {
        const sub = host.slice(0, -(tenantBase.length + 1));
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
 * Prefer tenant subdomains on the production root / store base.
 * Keep path mode on localhost / Netlify / Vercel betas.
 */
export function shouldUseSubdomainStorefrontUrls(hostname?: string): boolean {
    const mode = (import.meta.env.VITE_TENANT_ROUTING || "auto").trim().toLowerCase();
    if (mode === "path") {
        return false;
    }
    if (mode === "subdomain") {
        return true;
    }

    const host = normalizeHost(hostname);
    if (host === getPublicSiteHost()) {
        return false;
    }
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
    const tenantBase = getTenantBaseDomain();
    return (
        host === root
        || host === `www.${root}`
        || host === tenantBase
        || host === `www.${tenantBase}`
        || host.endsWith(`.${tenantBase}`)
        || host.endsWith(`.${root}`)
    );
}

export function getStorefrontOrigin(slug: string, hostname?: string): string {
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug) {
        return window.location.origin;
    }

    if (!shouldUseSubdomainStorefrontUrls(hostname)) {
        return window.location.origin;
    }

    const protocol = window.location.protocol === "http:" ? "http:" : "https:";
    // Local subdomain testing: test.localhost:5173
    if (normalizeHost(hostname) === "localhost" || normalizeHost(hostname).endsWith(".localhost")) {
        const port = window.location.port ? `:${window.location.port}` : "";
        return `${protocol}//${cleanSlug}.localhost${port}`;
    }
    return `${protocol}//${cleanSlug}.${getTenantBaseDomain()}`;
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

    if (shouldUseSubdomainStorefrontUrls()) {
        return `${getStorefrontOrigin(cleanSlug)}${suffix || ""}`;
    }

    return `/${cleanSlug}${suffix}`;
}

/** Display label for admin UI, e.g. test21.retailcosmos.com */
export function formatStorefrontHost(slug: string): string {
    const cleanSlug = (slug || "your-store").trim().toLowerCase() || "your-store";
    if (shouldUseSubdomainStorefrontUrls()) {
        return `${cleanSlug}.${getTenantBaseDomain()}`;
    }
    return `/${cleanSlug}`;
}
