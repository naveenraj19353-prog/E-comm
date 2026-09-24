/**
 * Crawler routing for storefront URLs (Netlify Edge, Deno).
 *
 * - robots.txt / sitemap*.xml (every User-Agent): proxied to the API's
 *   /seo/robots.txt and /seo/sitemap*.xml for the requesting host.
 * - Search crawlers (Googlebot, Bingbot, ...): store home, product listing /
 *   category pages and product detail get indexable server-rendered HTML
 *   from /seo/render/... (dynamic rendering). No noindex.
 * - Social preview bots (WhatsApp, Facebook, X, ...): the Open Graph pages
 *   from /og/... as before (noindex, they only exist for link previews).
 * - Everyone else (humans): untouched SPA via context.next().
 *
 * Classification is by User-Agent only. Keep SEARCH_CRAWLER_UA and
 * SOCIAL_PREVIEW_UA in sync with client/server.cjs and client/vercel.json;
 * tests/test_seo.py reads these two regexes from this file.
 *
 * Set Netlify env: API_BASE_URL=https://api.retailcosmos.com (no trailing
 * slash) and TENANT_BASE_DOMAIN (defaults to ROOT_DOMAIN / retailcosmos.com).
 */

type DenoEnv = { env: { get(key: string): string | undefined } };

/** Netlify Edge runs on Deno; avoid bare `Deno` so Vite/TS IDE stays clean. */
function edgeEnv(key: string): string | undefined {
  const runtime = globalThis as typeof globalThis & { Deno?: DenoEnv };
  return runtime.Deno?.env.get(key);
}

const SEARCH_CRAWLER_UA = /googlebot|google-inspectiontool|storebot-google|googleother|adsbot-google|bingbot|bingpreview|msnbot|duckduckbot|applebot|yandexbot|yandexmobilebot|yandeximages|baiduspider|slurp/i;

const SOCIAL_PREVIEW_UA = /facebookexternalhit|facebot|meta-externalagent|twitterbot|whatsapp|linkedinbot|slackbot|discordbot|telegrambot|pinterestbot|redditbot|embedly|quora link preview|skypeuripreview|vkshare|iframely|mastodon|bluesky/i;

type CrawlerKind = "search" | "social" | null;

function classifyUserAgent(ua: string): CrawlerKind {
  if (!ua) {
    return null;
  }
  if (SEARCH_CRAWLER_UA.test(ua)) {
    return "search";
  }
  if (SOCIAL_PREVIEW_UA.test(ua)) {
    return "social";
  }
  return null;
}

const PRODUCT_SUBPATH = /^\/product-details\/([a-f\d]{24})\/?$/i;

/** First path segments that belong to the platform, never to a store slug. */
const RESERVED_SLUGS = new Set([
  "www",
  "admin",
  "api",
  "app",
  "beta",
  "staging",
  "mail",
  "cdn",
  "create-store",
  "legal",
  "welcome-alt",
  "login",
  "register",
  "logout",
  "shops",
  "store",
  "stores",
  "images",
  "assets",
  "videos",
  "src",
]);

function tenantFromHost(hostname: string, tenantBaseDomain: string): string | null {
  const host = hostname.toLowerCase();
  const base = tenantBaseDomain.toLowerCase();
  if (host === base || host === `www.${base}`) {
    return null;
  }
  if (!host.endsWith(`.${base}`)) {
    return null;
  }
  const sub = host.slice(0, -(base.length + 1));
  if (!sub || sub.includes(".") || RESERVED_SLUGS.has(sub)) {
    return null;
  }
  return sub;
}

type StoreLocation = { slug: string; subPath: string };

/** Store slug + store-relative path, for subdomain or /{slug}/... path mode. */
function locateStore(url: URL, tenantBaseDomain: string): StoreLocation | null {
  const hostTenant = tenantFromHost(url.hostname, tenantBaseDomain);
  if (hostTenant) {
    return { slug: hostTenant, subPath: url.pathname || "/" };
  }
  const match = url.pathname.match(/^\/([a-z0-9][a-z0-9-]*)(\/.*)?$/i);
  if (!match) {
    return null;
  }
  const slug = match[1].toLowerCase();
  if (RESERVED_SLUGS.has(slug)) {
    return null;
  }
  return { slug, subPath: match[2] || "/" };
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchUpstream(target: string, ua: string, accept: string): Promise<Response | null> {
  try {
    const signal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        : undefined;
    return await fetch(target, {
      headers: { "user-agent": ua, accept },
      signal,
    });
  } catch {
    return null;
  }
}

function respond(
  request: Request,
  body: string,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

/** robots.txt and sitemaps for store hosts, /{slug}/sitemap.xml and the platform. */
async function serveSeoFile(
  request: Request,
  url: URL,
  apiBase: string,
  tenantBaseDomain: string,
  ua: string,
): Promise<Response | null> {
  const path = url.pathname.toLowerCase();
  const hostTenant = tenantFromHost(url.hostname, tenantBaseDomain);
  const host = encodeURIComponent(url.hostname);
  const page = url.searchParams.get("page");
  const pageQuery = page && /^\d{1,5}$/.test(page) ? `&page=${page}` : "";

  let target: string | null = null;
  let contentType = "application/xml; charset=utf-8";
  let isPlatform = !hostTenant;

  if (path === "/robots.txt") {
    target = `${apiBase}/seo/robots.txt?host=${host}`;
    contentType = "text/plain; charset=utf-8";
  } else if (path === "/sitemap.xml") {
    target = `${apiBase}/seo/sitemap.xml?host=${host}${pageQuery}`;
  } else if (path === "/sitemap-platform.xml" && !hostTenant) {
    target = `${apiBase}/seo/sitemap-platform.xml?host=${host}`;
  } else if (!hostTenant) {
    const match = path.match(/^\/([a-z0-9][a-z0-9-]*)\/sitemap\.xml$/);
    if (match && !RESERVED_SLUGS.has(match[1])) {
      target = `${apiBase}/seo/sitemap.xml?slug=${encodeURIComponent(match[1])}${pageQuery}`;
      isPlatform = false;
    }
  }
  if (!target) {
    return null;
  }

  const upstream = await fetchUpstream(target, ua, contentType.split(";")[0]);
  if (upstream && (upstream.ok || upstream.status === 404)) {
    return respond(request, await upstream.text(), upstream.status, {
      "content-type": contentType,
      "cache-control": upstream.ok ? "public, max-age=3600" : "public, max-age=300",
    });
  }
  // API unreachable: the platform host falls back to the static files in
  // public/; a store host must not serve the platform's sitemap as its own.
  if (isPlatform) {
    return null;
  }
  return respond(request, "Temporarily unavailable\n", 503, {
    "content-type": "text/plain; charset=utf-8",
    "retry-after": "300",
    "cache-control": "no-store",
  });
}

/** Map a store-relative path to the API crawler page, or null to use the SPA. */
function crawlerRenderTarget(apiBase: string, store: StoreLocation, url: URL): string | null {
  const slug = encodeURIComponent(store.slug);
  const subPath = store.subPath.replace(/\/+$/, "") || "/";
  if (subPath === "/") {
    return `${apiBase}/seo/render/${slug}`;
  }
  if (subPath.toLowerCase() === "/products") {
    const query = new URLSearchParams();
    for (const value of url.searchParams.getAll("categoryIds")) {
      query.append("categoryIds", value);
    }
    const category = url.searchParams.get("category");
    if (category) {
      query.append("category", category);
    }
    const page = url.searchParams.get("page");
    if (page && /^\d{1,5}$/.test(page)) {
      query.set("page", page);
    }
    const qs = query.toString();
    return `${apiBase}/seo/render/${slug}/products${qs ? `?${qs}` : ""}`;
  }
  const product = subPath.match(PRODUCT_SUBPATH);
  if (product) {
    return `${apiBase}/seo/render/${slug}/product/${encodeURIComponent(product[1])}`;
  }
  return null;
}

async function serveSearchCrawler(
  request: Request,
  url: URL,
  apiBase: string,
  tenantBaseDomain: string,
  ua: string,
): Promise<Response | null> {
  const store = locateStore(url, tenantBaseDomain);
  if (!store || store.subPath.includes(".")) {
    return null;
  }
  const target = crawlerRenderTarget(apiBase, store, url);
  if (!target) {
    return null;
  }
  const upstream = await fetchUpstream(target, ua, "text/html");
  if (!upstream) {
    return null;
  }
  if (upstream.ok) {
    return respond(request, await upstream.text(), 200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=600",
      vary: "User-Agent",
    });
  }
  if (upstream.status === 404) {
    // Missing / suspended store or inactive product: tell crawlers to drop it.
    return respond(request, await upstream.text(), 404, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex",
      vary: "User-Agent",
    });
  }
  return null;
}

async function serveSocialPreview(
  request: Request,
  url: URL,
  apiBase: string,
  tenantBaseDomain: string,
  ua: string,
): Promise<Response | null> {
  const store = locateStore(url, tenantBaseDomain);
  if (!store || store.subPath.includes(".")) {
    return null;
  }
  const slug = encodeURIComponent(store.slug);
  const product = store.subPath.match(PRODUCT_SUBPATH);
  const target = product
    ? `${apiBase}/og/product/${slug}/${encodeURIComponent(product[1])}`
    : `${apiBase}/og/store/${slug}`;
  const upstream = await fetchUpstream(target, ua, "text/html");
  if (!upstream || !upstream.ok) {
    return null;
  }
  return respond(request, await upstream.text(), 200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=300",
    "x-robots-tag": "noindex",
    vary: "User-Agent",
  });
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return context.next();
  }
  const url = new URL(request.url);
  const ua = request.headers.get("user-agent") || "";
  const tenantBaseDomain =
    edgeEnv("TENANT_BASE_DOMAIN") || edgeEnv("ROOT_DOMAIN") || "retailcosmos.com";
  const apiBase = (edgeEnv("API_BASE_URL") || "https://api.retailcosmos.com").replace(/\/$/, "");

  const lowerPath = url.pathname.toLowerCase();
  if (lowerPath === "/robots.txt" || lowerPath.endsWith("sitemap.xml") || lowerPath === "/sitemap-platform.xml") {
    const seoFile = await serveSeoFile(request, url, apiBase, tenantBaseDomain, ua);
    return seoFile || context.next();
  }

  const kind = classifyUserAgent(ua);
  if (kind === "search") {
    return (await serveSearchCrawler(request, url, apiBase, tenantBaseDomain, ua)) || context.next();
  }
  if (kind === "social") {
    return (await serveSocialPreview(request, url, apiBase, tenantBaseDomain, ua)) || context.next();
  }
  return context.next();
};
