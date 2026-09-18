/**
 * Serve bot-crawlable Open Graph HTML for product and storefront URLs.
 * Humans still get the SPA via context.next().
 *
 * Set Netlify env: API_BASE_URL=https://api.retailcosmos.com
 * (no trailing slash)
 */

type DenoEnv = { env: { get(key: string): string | undefined } };

/** Netlify Edge runs on Deno; avoid bare `Deno` so Vite/TS IDE stays clean. */
function edgeEnv(key: string): string | undefined {
  const runtime = globalThis as typeof globalThis & { Deno?: DenoEnv };
  return runtime.Deno?.env.get(key);
}

const BOT_UA =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|googlebot|bingbot|baiduspider|duckduckbot|embedly|quora link preview|pinterest|redditbot|applebot|semrushbot|preview/i;

const PRODUCT_PATH =
  /^(?:\/([^/]+))?\/product-details\/([a-f\d]{24})\/?$/i;

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
  "login",
  "register",
  "logout",
  "shops",
  "store",
  "stores",
  "images",
  "assets",
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

function storefrontSlug(
  pathname: string,
  hostname: string,
  tenantBaseDomain: string,
): string | null {
  const hostTenant = tenantFromHost(hostname, tenantBaseDomain);
  if (hostTenant) {
    return hostTenant;
  }
  const match = pathname.match(/^\/([a-z0-9-]+)(?:\/.*)?$/i);
  if (!match) {
    return null;
  }
  const slug = match[1].toLowerCase();
  if (RESERVED_SLUGS.has(slug) || pathname.includes(".")) {
    return null;
  }
  return slug;
}

async function fetchOgHtml(ogUrl: string, ua: string): Promise<string | null> {
  try {
    const upstream = await fetch(ogUrl, {
      headers: {
        "user-agent": ua,
        accept: "text/html",
      },
    });
    if (!upstream.ok) {
      return null;
    }
    return await upstream.text();
  } catch {
    return null;
  }
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) {
    return context.next();
  }

  const url = new URL(request.url);
  const tenantBaseDomain =
    edgeEnv("TENANT_BASE_DOMAIN") ||
    (edgeEnv("ROOT_DOMAIN") || "retailcosmos.com");
  const apiBase = (edgeEnv("API_BASE_URL") || "https://api.retailcosmos.com").replace(
    /\/$/,
    "",
  );

  const productMatch = url.pathname.match(PRODUCT_PATH);
  if (productMatch) {
    const pathTenant = productMatch[1] ? productMatch[1].toLowerCase() : null;
    const productId = productMatch[2];
    const hostTenant = tenantFromHost(url.hostname, tenantBaseDomain);
    const tenantSlug = hostTenant || pathTenant;
    if (tenantSlug && productId) {
      const html = await fetchOgHtml(
        `${apiBase}/og/product/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productId)}`,
        ua,
      );
      if (html) {
        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
            "x-robots-tag": "noindex",
          },
        });
      }
    }
    return context.next();
  }

  const tenantSlug = storefrontSlug(url.pathname, url.hostname, tenantBaseDomain);
  if (!tenantSlug) {
    return context.next();
  }

  const html = await fetchOgHtml(
    `${apiBase}/og/store/${encodeURIComponent(tenantSlug)}`,
    ua,
  );
  if (!html) {
    return context.next();
  }
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex",
    },
  });
};
