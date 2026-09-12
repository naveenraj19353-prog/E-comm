/**
 * Serve bot-crawlable Open Graph HTML for product URLs.
 * Humans still get the SPA via context.next().
 *
 * Set Netlify env: API_BASE_URL=https://api.retailcosmos.com
 * (no trailing slash)
 */

const BOT_UA =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|googlebot|bingbot|baiduspider|duckduckbot|embedly|quora link preview|pinterest|redditbot|applebot|semrushbot|preview/i;

const PRODUCT_PATH =
  /^(?:\/([^/]+))?\/product-details\/([a-f\d]{24})\/?$/i;

function tenantFromHost(hostname: string, rootDomain: string): string | null {
  const host = hostname.toLowerCase();
  const root = rootDomain.toLowerCase();
  if (!host.endsWith(`.${root}`)) {
    return null;
  }
  const sub = host.slice(0, -(root.length + 1));
  if (!sub || sub === "www" || sub === "api") {
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
  const rootDomain = Deno.env.get("ROOT_DOMAIN") || "retailcosmos.com";
  const hostTenant = tenantFromHost(url.hostname, rootDomain);
  const tenantSlug = hostTenant || pathTenant;

  if (!tenantSlug || !productId) {
    return context.next();
  }

  const apiBase = (Deno.env.get("API_BASE_URL") || "https://api.retailcosmos.com").replace(
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
