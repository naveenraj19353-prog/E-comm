import { useEffect } from "react";
import {
  getStorefrontHref,
  getTenantSlugFromHostname,
} from "../tenant/tenantHost";

export type PageSeoInput = {
  title: string;
  description?: string;
  /** Absolute or site-relative path for canonical (defaults to current URL). */
  path?: string;
  tenantSlug?: string | null;
  image?: string | null;
  type?: "website" | "product" | "article";
  /** Overrides og:site_name (defaults to Retail Cosmos). */
  siteName?: string | null;
  /** noindex for private / auth / admin surfaces */
  noIndex?: boolean;
};

const DEFAULT_DESCRIPTION =
  "Retail Cosmos — multi-tenant storefronts for fashion, lifestyle, and more.";

/** Default share image for pages that do not pass a custom OG image. */
export const DEFAULT_OG_IMAGE = "/images/welcome/fashion-hero.png";

const setMeta = (
  attr: "name" | "property",
  key: string,
  content: string,
) => {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
};

const setLink = (rel: string, href: string) => {
  let el = document.head.querySelector(
    `link[rel="${rel}"]`,
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
};

const absoluteUrl = (maybeRelative: string): string => {
  if (!maybeRelative) {
    return window.location.href;
  }
  if (/^https?:\/\//i.test(maybeRelative)) {
    return maybeRelative;
  }
  try {
    return new URL(maybeRelative, window.location.origin).href;
  } catch {
    return window.location.href;
  }
};

/**
 * Resolve a public canonical URL for the current storefront view.
 * Prefer tenant subdomain URLs in production; path mode locally / on Netlify.
 */
export const buildCanonicalUrl = (
  path: string | undefined,
  tenantSlug?: string | null,
): string => {
  if (!path) {
    return window.location.href.split("#")[0].split("?")[0];
  }

  const slug = (tenantSlug || getTenantSlugFromHostname() || "").trim();
  if (slug && !path.startsWith("http")) {
    // getStorefrontHref returns relative on subdomain or /slug/path in path mode
    const href = getStorefrontHref(slug, path === "/" ? "/" : path);
    return absoluteUrl(href);
  }

  return absoluteUrl(path);
};

export const applyPageSeo = ({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  tenantSlug,
  image,
  type = "website",
  siteName,
  noIndex = false,
}: PageSeoInput) => {
  const brand = (siteName || "Retail Cosmos").trim() || "Retail Cosmos";
  const fullTitle =
    title.includes(brand) || title.includes("Retail Cosmos")
      ? title
      : `${title} | ${brand}`;
  document.title = fullTitle;

  const desc = description.trim().slice(0, 320) || DEFAULT_DESCRIPTION;
  const canonical = buildCanonicalUrl(path, tenantSlug);
  const imageUrl = absoluteUrl(image?.trim() || DEFAULT_OG_IMAGE);

  setMeta("name", "description", desc);
  setMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");
  setLink("canonical", canonical);

  setMeta("property", "og:site_name", brand);
  setMeta("property", "og:title", fullTitle);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:type", type === "product" ? "product" : "website");
  setMeta("property", "og:url", canonical);
  setMeta("property", "og:image", imageUrl);

  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", fullTitle);
  setMeta("name", "twitter:description", desc);
  setMeta("name", "twitter:image", imageUrl);
};

/** React hook: apply document head SEO whenever inputs change. */
export const usePageSeo = (seo: PageSeoInput) => {
  useEffect(() => {
    applyPageSeo(seo);
  }, [
    seo.title,
    seo.description,
    seo.path,
    seo.tenantSlug,
    seo.image,
    seo.type,
    seo.siteName,
    seo.noIndex,
  ]);
};
