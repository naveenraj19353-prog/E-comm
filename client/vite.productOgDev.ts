import type { Plugin } from "vite";

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

function hostTenant(hostHeader: string): string | null {
  const host = hostHeader.split(":")[0].toLowerCase();
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub && !RESERVED_SLUGS.has(sub) ? sub : null;
  }
  return null;
}

function storefrontSlug(pathname: string, hostHeader: string): string | null {
  const fromHost = hostTenant(hostHeader);
  if (fromHost) {
    return fromHost;
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

async function writeOg(res: import("http").ServerResponse, ogUrl: string, ua: string) {
  const upstream = await fetch(ogUrl, {
    headers: {
      "user-agent": ua,
      accept: "text/html",
    },
  });
  if (!upstream.ok) {
    return false;
  }
  const html = await upstream.text();
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(html);
  return true;
}

/**
 * Local stand-in for Netlify Edge: WhatsApp-style bots get API OG HTML.
 */
export function productOgDevPlugin(apiTarget: string): Plugin {
  const apiBase = apiTarget.replace(/\/$/, "");

  return {
    name: "product-og-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const ua = String(req.headers["user-agent"] || "");
          if (!BOT_UA.test(ua)) {
            next();
            return;
          }

          const pathOnly = (req.url || "").split("?")[0];
          const host = String(req.headers.host || "");
          const productMatch = pathOnly.match(PRODUCT_PATH);
          if (productMatch) {
            const pathTenant = productMatch[1] ? productMatch[1].toLowerCase() : null;
            const productId = productMatch[2];
            const tenantSlug = hostTenant(host) || pathTenant;
            if (tenantSlug && productId) {
              const served = await writeOg(
                res,
                `${apiBase}/og/product/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productId)}`,
                ua,
              );
              if (served) {
                return;
              }
            }
            next();
            return;
          }

          const tenantSlug = storefrontSlug(pathOnly, host);
          if (!tenantSlug) {
            next();
            return;
          }

          const served = await writeOg(
            res,
            `${apiBase}/og/store/${encodeURIComponent(tenantSlug)}`,
            ua,
          );
          if (!served) {
            next();
          }
        } catch {
          next();
        }
      });
    },
  };
}
