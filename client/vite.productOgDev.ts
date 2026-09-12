import type { Plugin } from "vite";

const BOT_UA =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|googlebot|bingbot|baiduspider|duckduckbot|embedly|quora link preview|pinterest|redditbot|applebot|semrushbot|preview/i;

const PRODUCT_PATH =
  /^(?:\/([^/]+))?\/product-details\/([a-f\d]{24})\/?$/i;

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
          const ua = req.headers["user-agent"] || "";
          if (!BOT_UA.test(String(ua))) {
            next();
            return;
          }

          const pathOnly = (req.url || "").split("?")[0];
          const match = pathOnly.match(PRODUCT_PATH);
          if (!match) {
            next();
            return;
          }

          const pathTenant = match[1] ? match[1].toLowerCase() : null;
          const productId = match[2];
          const host = String(req.headers.host || "")
            .split(":")[0]
            .toLowerCase();
          const hostTenant = host.endsWith(".localhost")
            ? host.slice(0, -".localhost".length) || null
            : null;
          const tenantSlug = hostTenant || pathTenant;

          if (!tenantSlug || !productId) {
            next();
            return;
          }

          const ogUrl = `${apiBase}/og/product/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productId)}`;
          const upstream = await fetch(ogUrl, {
            headers: {
              "user-agent": String(ua),
              accept: "text/html",
            },
          });

          if (!upstream.ok) {
            next();
            return;
          }

          const html = await upstream.text();
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=60");
          res.setHeader("X-Robots-Tag", "noindex");
          res.end(html);
        } catch {
          next();
        }
      });
    },
  };
}
