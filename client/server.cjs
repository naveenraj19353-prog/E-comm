const express = require("express");
const path = require("path");
const fs = require("fs");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiTarget = process.env.API_PROXY_TARGET?.trim();
if (!apiTarget) {
    console.error("Set API_PROXY_TARGET to your backend URL (e.g. in client/.env).");
    process.exit(1);
}
const distDir = path.join(__dirname, "dist");
const rootDomain = (process.env.ROOT_DOMAIN || "retailcosmos.com").toLowerCase();
const publicSiteHost = new URL(
    process.env.PUBLIC_SITE_URL || "https://app.retailcosmos.com",
).hostname.toLowerCase();

// Keep in sync with netlify/edge-functions/product-og.ts (tests/test_seo.py
// checks both files). Search crawlers get indexable HTML from /seo/render,
// social preview bots get the noindex OG pages, humans get the SPA.
const SEARCH_CRAWLER_UA = /googlebot|google-inspectiontool|storebot-google|googleother|adsbot-google|bingbot|bingpreview|msnbot|duckduckbot|applebot|yandexbot|yandexmobilebot|yandeximages|baiduspider|slurp/i;

const SOCIAL_PREVIEW_UA = /facebookexternalhit|facebot|meta-externalagent|twitterbot|whatsapp|linkedinbot|slackbot|discordbot|telegrambot|pinterestbot|redditbot|embedly|quora link preview|skypeuripreview|vkshare|iframely|mastodon|bluesky/i;

const PRODUCT_SUBPATH = /^\/product-details\/([a-f\d]{24})\/?$/i;

const RESERVED_SLUGS = new Set([
    "www", "admin", "api", "app", "beta", "staging", "mail", "cdn",
    "create-store", "legal", "welcome-alt", "login", "register", "logout",
    "shops", "store", "stores", "images", "assets", "videos", "src",
]);

const apiBase = apiTarget.replace(/\/$/, "");

function classifyUserAgent(ua) {
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

function tenantFromHost(hostname) {
    const host = String(hostname || "")
        .split(":")[0]
        .toLowerCase();
    if (host === publicSiteHost) {
        return null;
    }
    if (!host.endsWith(`.${rootDomain}`)) {
        return null;
    }
    const sub = host.slice(0, -(rootDomain.length + 1));
    if (!sub || sub.includes(".") || RESERVED_SLUGS.has(sub)) {
        return null;
    }
    return sub;
}

function locateStore(req) {
    const pathname = String(req.path || "/");
    const hostTenant = tenantFromHost(req.hostname);
    if (hostTenant) {
        return { slug: hostTenant, subPath: pathname };
    }
    const match = pathname.match(/^\/([a-z0-9][a-z0-9-]*)(\/.*)?$/i);
    if (!match || RESERVED_SLUGS.has(match[1].toLowerCase())) {
        return null;
    }
    return { slug: match[1].toLowerCase(), subPath: match[2] || "/" };
}

async function fetchUpstream(target, ua, accept) {
    try {
        return await fetch(target, {
            headers: { "user-agent": ua, accept },
            signal: AbortSignal.timeout(8000),
        });
    } catch (error) {
        console.error("SEO proxy failed:", error);
        return null;
    }
}

function crawlerRenderTarget(store, req) {
    const slug = encodeURIComponent(store.slug);
    const subPath = store.subPath.replace(/\/+$/, "") || "/";
    if (subPath === "/") {
        return `${apiBase}/seo/render/${slug}`;
    }
    if (subPath.toLowerCase() === "/products") {
        const query = new URLSearchParams();
        const url = new URL(req.originalUrl, "http://local");
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

/** robots.txt + sitemaps for every User-Agent (dynamic, per host). */
async function serveSeoFiles(req, res, next) {
    const path = String(req.path || "").toLowerCase();
    const hostTenant = tenantFromHost(req.hostname);
    const host = encodeURIComponent(String(req.hostname || ""));
    const page = String(req.query.page || "");
    const pageQuery = /^\d{1,5}$/.test(page) ? `&page=${page}` : "";
    let target = null;
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
        return next();
    }
    const upstream = await fetchUpstream(target, req.get("user-agent") || "", contentType.split(";")[0]);
    if (upstream && (upstream.ok || upstream.status === 404)) {
        return res
            .status(upstream.status)
            .set({
                "Content-Type": contentType,
                "Cache-Control": upstream.ok ? "public, max-age=3600" : "public, max-age=300",
            })
            .send(await upstream.text());
    }
    if (isPlatform) {
        return next(); // static public/robots.txt, public/sitemap.xml
    }
    return res
        .status(503)
        .set({ "Retry-After": "300", "Cache-Control": "no-store" })
        .type("text/plain")
        .send("Temporarily unavailable\n");
}

async function serveCrawlerPage(req, res, next) {
    const ua = req.get("user-agent") || "";
    const kind = classifyUserAgent(ua);
    if (!kind) {
        return next();
    }
    const store = locateStore(req);
    if (!store || store.subPath.includes(".")) {
        return next();
    }

    if (kind === "search") {
        const target = crawlerRenderTarget(store, req);
        if (!target) {
            return next();
        }
        const upstream = await fetchUpstream(target, ua, "text/html");
        if (!upstream || (!upstream.ok && upstream.status !== 404)) {
            return next();
        }
        const headers = {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": upstream.ok ? "public, max-age=600" : "public, max-age=300",
            Vary: "User-Agent",
        };
        if (!upstream.ok) {
            headers["X-Robots-Tag"] = "noindex";
        }
        return res.status(upstream.status).set(headers).send(await upstream.text());
    }

    const slug = encodeURIComponent(store.slug);
    const product = store.subPath.match(PRODUCT_SUBPATH);
    const target = product
        ? `${apiBase}/og/product/${slug}/${encodeURIComponent(product[1])}`
        : `${apiBase}/og/store/${slug}`;
    const upstream = await fetchUpstream(target, ua, "text/html");
    if (!upstream || !upstream.ok) {
        return next();
    }
    return res
        .status(200)
        .set({
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "X-Robots-Tag": "noindex",
            Vary: "User-Agent",
        })
        .send(await upstream.text());
}

app.use(
    "/api",
    createProxyMiddleware({
        target: apiTarget,
        changeOrigin: true,
        secure: true,
        pathRewrite: { "^/api": "" },
    }),
);

app.get(/.*/, serveSeoFiles);

app.use(express.static(distDir));

app.get(/.*/, serveCrawlerPage, (_req, res) => {
    const indexPath = path.join(distDir, "index.html");
    if (!fs.existsSync(indexPath)) {
        res.status(500).send("Client build missing. Run npm run build.");
        return;
    }
    res.sendFile(indexPath);
});

app.listen(port, () => {
    console.log(`Client listening on port ${port}, API proxy -> ${apiTarget}`);
});
