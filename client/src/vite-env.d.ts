/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_RAZORPAY_KEY_ID?: string;
    /** Direct API origin for Vercel/production builds (optional) */
    readonly VITE_API_URL?: string;
    /** Public platform origin, e.g. https://app.retailcosmos.com */
    readonly VITE_PUBLIC_SITE_URL?: string;
    /** Apex domain, e.g. retailcosmos.com */
    readonly VITE_ROOT_DOMAIN?: string;
    /** Tenant storefront base, e.g. retailcosmos.com → {slug}.retailcosmos.com */
    readonly VITE_TENANT_BASE_DOMAIN?: string;
    /** auto | path | subdomain */
    readonly VITE_TENANT_ROUTING?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
