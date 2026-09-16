/**
 * Serve bot-crawlable Open Graph HTML for product URLs.
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
  if (!sub || sub.includes(".") || sub === "www" || sub === "api" || sub === "store") {
    return null;
  }
  return sub;
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) {
    return context.next();
  }

  const url = new URL(request.url);
  const match = url.pathname.match(PRODUCT_PATH);
  if (!match) {
    return context.next();
  }

  const pathTenant = match[1] ? match[1].toLowerCase() : null;
  const productId = match[2];
  const tenantBaseDomain =
    edgeEnv("TENANT_BASE_DOMAIN") ||
    `store.${edgeEnv("ROOT_DOMAIN") || "retailcosmos.com"}`;
  const hostTenant = tenantFromHost(url.hostname, tenantBaseDomain);
  const tenantSlug = hostTenant || pathTenant;

  if (!tenantSlug || !productId) {
    return context.next();
  }

  const apiBase = (edgeEnv("API_BASE_URL") || "https://api.retailcosmos.com").replace(
    /\/$/,
    "",
  );
  const ogUrl = `${apiBase}/og/product/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productId)}`;

  try {
    const upstream = await fetch(ogUrl, {
      headers: {
        "user-agent": ua,
        accept: "text/html",
      },
    });
    if (!upstream.ok) {
      return context.next();
    }
    const html = await upstream.text();
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    return context.next();
  }
};
