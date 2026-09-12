import {
    getStorefrontHref,
    getTenantSlugFromHostname,
    shouldUseSubdomainStorefrontUrls,
} from "../features/tenant/tenantHost";

function withTenantPath(tenant: string, suffix: string): string {
    const cleanTenant = tenant.trim().toLowerCase();
    const cleanSuffix = !suffix || suffix === "/" ? "/" : (suffix.startsWith("/") ? suffix : `/${suffix}`);
    const hostSlug = getTenantSlugFromHostname();

    // On tenant subdomain: never prefix the slug in the path.
    if (hostSlug) {
        return cleanSuffix;
    }

    // On apex with subdomain routing: absolute tenant host URL.
    if (shouldUseSubdomainStorefrontUrls() && cleanTenant) {
        return getStorefrontHref(cleanTenant, cleanSuffix);
    }

    // Path mode (local / Netlify beta): /{slug}/...
    if (!cleanTenant) {
        return cleanSuffix;
    }
    return cleanSuffix === "/" ? `/${cleanTenant}` : `/${cleanTenant}${cleanSuffix}`;
}

export const routes = {
    home: (tenant: string) => withTenantPath(tenant, "/"),
    products: (tenant: string) => withTenantPath(tenant, "/products"),
    product: (tenant: string, id: string) => withTenantPath(tenant, `/product-details/${id}`),
    cart: (tenant: string) => withTenantPath(tenant, "/cart"),
    wishlist: (tenant: string) => withTenantPath(tenant, "/wishlist"),
    profile: (tenant: string) => withTenantPath(tenant, "/profile"),
    customize: (tenant: string) => withTenantPath(tenant, "/customize"),
    checkout: (tenant: string) => withTenantPath(tenant, "/checkout"),
    thankYou: (tenant: string, orderId: string) => withTenantPath(tenant, `/thank-you/${orderId}`),
    orders: (tenant: string) => withTenantPath(tenant, "/orders"),
    orderDetail: (tenant: string, orderId: string) => withTenantPath(tenant, `/orders/${orderId}`),
    login: (tenant: string) => withTenantPath(tenant, "/login"),
    register: (tenant: string) => withTenantPath(tenant, "/register"),
    forgotPassword: (tenant: string) => withTenantPath(tenant, "/forgot-password"),
    resetPassword: (tenant: string) => withTenantPath(tenant, "/reset-password"),
};

export function withQuery(href: string, query: Record<string, string | undefined | null>): string {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value != null && value !== "") {
            params.set(key, value);
        }
    });
    const qs = params.toString();
    if (!qs) {
        return href;
    }
    return href.includes("?") ? `${href}&${qs}` : `${href}?${qs}`;
}

/** Supports absolute subdomain URLs and in-app relative paths. */
export function storefrontNavigate(
    navigate: (to: string, options?: { replace?: boolean; state?: unknown }) => void,
    to: string,
    options?: { replace?: boolean; state?: unknown },
): void {
    if (/^https?:\/\//i.test(to)) {
        window.location.assign(to);
        return;
    }
    navigate(to, options);
}
