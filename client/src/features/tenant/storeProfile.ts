/**
 * Store profile fields shown on the storefront: business details / GSTIN
 * (REQ-011) and social media links (INT-013). The rules mirror
 * app/services/store_profile.py, which validates again on save.
 */

export type BusinessDetails = {
    legalName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    gstin?: string | null;
};

export type BusinessDetailKey = keyof BusinessDetails;

/** Search-engine title/description for the store home page (REQ-106, REQ-107). */
export type StoreSeo = {
    title?: string | null;
    description?: string | null;
};

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;

export type SocialPlatform = "facebook" | "instagram" | "x" | "linkedin" | "youtube";

export type SocialLinks = Partial<Record<SocialPlatform, string | null>>;

export const BUSINESS_DETAIL_FIELDS: Array<{ key: BusinessDetailKey; label: string; maxLength: number; placeholder?: string }> = [
    { key: "legalName", label: "Registered business name", maxLength: 120, placeholder: "e.g. Vedic Paan Pvt Ltd" },
    { key: "addressLine1", label: "Address line 1", maxLength: 120 },
    { key: "addressLine2", label: "Address line 2", maxLength: 120 },
    { key: "city", label: "City", maxLength: 60 },
    { key: "state", label: "State", maxLength: 60 },
    { key: "postalCode", label: "PIN code", maxLength: 12 },
    { key: "country", label: "Country", maxLength: 60, placeholder: "India" },
    { key: "gstin", label: "GSTIN", maxLength: 20, placeholder: "29ABCDE1234F1Z5" },
];

export const SOCIAL_PLATFORMS: Array<{ key: SocialPlatform; label: string; hosts: string[] }> = [
    { key: "instagram", label: "Instagram", hosts: ["instagram.com"] },
    { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
    { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
    { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"] },
    { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
];

// Indian GSTIN: 2-digit state code, 10-character PAN, entity number, "Z", checksum.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MAX_SOCIAL_LINK_LENGTH = 300;

export const normalizeGstin = (value: string): string => value.replace(/\s+/g, "").toUpperCase();

export function gstinError(value: string): string | null {
    const gstin = normalizeGstin(value);
    return !gstin || GSTIN_PATTERN.test(gstin) ? null : "GSTIN must be 15 characters, for example 29ABCDE1234F1Z5.";
}

export function socialLinkError(platform: SocialPlatform, value: string): string | null {
    const text = value.trim();
    if (!text) {
        return null;
    }
    const { label, hosts } = SOCIAL_PLATFORMS.find((item) => item.key === platform)!;
    const message = `${label} link must be an https:// link on ${hosts[0]}.`;
    if (text.length > MAX_SOCIAL_LINK_LENGTH) {
        return message;
    }
    try {
        const url = new URL(text);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== "https:" || url.username || url.password) {
            return message;
        }
        return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) ? null : message;
    } catch {
        return message;
    }
}

/** Address lines for display, skipping empty parts. */
export function addressLines(details?: BusinessDetails | null): string[] {
    if (!details) {
        return [];
    }
    const cityLine = [details.city, details.state].filter(Boolean).join(", ");
    return [
        details.addressLine1,
        details.addressLine2,
        [cityLine, details.postalCode].filter(Boolean).join(" "),
        details.country,
    ].filter((line): line is string => Boolean(line && line.trim()));
}

/** Social links that are set, in display order. */
export function activeSocialLinks(links?: SocialLinks | null): Array<{ key: SocialPlatform; label: string; url: string }> {
    return SOCIAL_PLATFORMS.flatMap(({ key, label }) => {
        const url = links?.[key]?.trim();
        // Saved links were validated by the server; re-check before rendering a clickable link.
        return url && !socialLinkError(key, url) ? [{ key, label, url }] : [];
    });
}
