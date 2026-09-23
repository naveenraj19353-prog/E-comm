import type { FooterSection } from "../components/Footer/types";

export const FOOTER_HREF_BY_LABEL: Record<string, string> = {
    about: "/about",
    contact: "/contact",
    privacy: "/privacy",
    "privacy policy": "/privacy",
    terms: "/terms",
    "terms of service": "/terms",
    "terms & conditions": "/terms",
    returns: "/returns",
    shipping: "/shipping",
    faqs: "/returns",
    "all services": "/products",
    services: "/products",
    "full menu": "/products",
    menu: "/products",
    saved: "/wishlist",
    "my list": "/cart",
    "my order": "/cart",
    "order history": "/orders",
    "shop all": "/products",
    "all products": "/products",
    products: "/products",
    men: "/products",
    women: "/products",
    kids: "/products",
    accessories: "/products",
    wishlist: "/wishlist",
    cart: "/cart",
    "my orders": "/orders",
    orders: "/orders",
};

export const resolveFooterHref = (label: string, href?: string): string => {
    const current = (href || "").trim();
    if (current && current !== "#") {
        return current;
    }
    return FOOTER_HREF_BY_LABEL[label.trim().toLowerCase()] || "";
};

export const normalizeFooterSections = (sections: FooterSection[]): FooterSection[] =>
    sections
        .map((section) => ({
            title: section.title,
            links: section.links
                .map((link) => ({
                    label: link.label,
                    href: resolveFooterHref(link.label, link.href),
                }))
                .filter((link) => Boolean(link.href)),
        }))
        .filter((section) => section.links.length > 0);

type StoreBusinessType = "retail" | "service" | "menu";

const toBusinessType = (value?: string | null): StoreBusinessType =>
    value === "service" || value === "menu" ? value : "retail";

/**
 * Which storefront pages exist for each business type.
 * Retail: full shop (orders, delivery, returns, terms).
 * Service: listings + saved list, no orders/delivery.
 * Menu: dine-in ordering, pay at counter, no delivery/returns.
 */
export const STOREFRONT_PATHS_BY_BUSINESS: Record<StoreBusinessType, ReadonlySet<string>> = {
    retail: new Set([
        "/products", "/wishlist", "/cart", "/orders",
        "/about", "/contact", "/privacy", "/terms", "/returns", "/shipping",
    ]),
    service: new Set([
        "/products", "/wishlist", "/cart",
        "/about", "/contact", "/privacy",
    ]),
    menu: new Set([
        "/products", "/wishlist", "/cart", "/orders",
        "/about", "/contact", "/privacy",
    ]),
};

/** True when a storefront path (e.g. "/terms") applies to this business type. */
export const isStorefrontPathAllowed = (
    path: string,
    businessType?: string | null,
): boolean => {
    const clean = `/${path.replace(/^\/+/, "").split(/[?#]/)[0]}`;
    return STOREFRONT_PATHS_BY_BUSINESS[toBusinessType(businessType)].has(clean);
};

/** Drop internal links that do not apply to the store type; external links are kept. */
export const filterFooterSectionsForBusiness = (
    sections: FooterSection[],
    businessType?: string | null,
): FooterSection[] =>
    sections
        .map((section) => ({
            title: section.title,
            links: section.links.filter((link) => {
                const href = resolveFooterHref(link.label, link.href);
                if (!href) {
                    return false;
                }
                if (!href.startsWith("/")) {
                    return true;
                }
                return isStorefrontPathAllowed(href, businessType);
            }),
        }))
        .filter((section) => section.links.length > 0);

const FOOTER_SECTIONS_BY_BUSINESS: Record<StoreBusinessType, FooterSection[]> = {
    retail: [
        {
            title: "Shop",
            links: [
                { label: "Shop all", href: "/products" },
                { label: "Wishlist", href: "/wishlist" },
                { label: "Cart", href: "/cart" },
                { label: "My orders", href: "/orders" },
            ],
        },
        {
            title: "Company",
            links: [
                { label: "About", href: "/about" },
                { label: "Contact", href: "/contact" },
            ],
        },
        {
            title: "Support",
            links: [
                { label: "Returns", href: "/returns" },
                { label: "Shipping", href: "/shipping" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
            ],
        },
    ],
    service: [
        {
            title: "Services",
            links: [
                { label: "All services", href: "/products" },
                { label: "Saved", href: "/wishlist" },
                { label: "My list", href: "/cart" },
            ],
        },
        {
            title: "Company",
            links: [
                { label: "About", href: "/about" },
                { label: "Contact", href: "/contact" },
            ],
        },
        {
            title: "Support",
            links: [{ label: "Privacy Policy", href: "/privacy" }],
        },
    ],
    menu: [
        {
            title: "Menu",
            links: [
                { label: "Full menu", href: "/products" },
                { label: "My order", href: "/cart" },
                { label: "Order history", href: "/orders" },
            ],
        },
        {
            title: "Company",
            links: [
                { label: "About", href: "/about" },
                { label: "Contact", href: "/contact" },
            ],
        },
        {
            title: "Support",
            links: [{ label: "Privacy Policy", href: "/privacy" }],
        },
    ],
};

const FOOTER_DESCRIPTION_BY_BUSINESS: Record<StoreBusinessType, string> = {
    retail:
        "Shop this store with secure checkout. Delivery and returns follow the policies published on this site.",
    service:
        "Browse our services and save the ones you like. Contact us to book or ask a question.",
    menu:
        "Browse the menu, order from your table and pay at the counter.",
};

/** Retail defaults (kept for existing imports). */
export const DEFAULT_FOOTER_SECTIONS: FooterSection[] = FOOTER_SECTIONS_BY_BUSINESS.retail;

export const DEFAULT_FOOTER_DESCRIPTION = FOOTER_DESCRIPTION_BY_BUSINESS.retail;

export const buildDefaultFooterContent = (
    companyName = "Store",
    businessType?: string | null,
) => {
    const type = toBusinessType(businessType);
    return {
        companyName,
        description: FOOTER_DESCRIPTION_BY_BUSINESS[type],
        sections: FOOTER_SECTIONS_BY_BUSINESS[type].map((section) => ({
            title: section.title,
            links: section.links.map((link) => ({ ...link })),
        })),
    };
};
