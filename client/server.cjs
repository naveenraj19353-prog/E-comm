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

const BOT_UA =
    /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|googlebot|bingbot|baiduspider|duckduckbot|embedly|quora link preview|pinterest|redditbot|applebot|semrushbot|preview/i;

const PRODUCT_PATH =
    /^(?:\/([^/]+))?\/product-details\/([a-f\d]{24})\/?$/i;

function tenantFromHost(hostname) {
    const host = String(hostname || "")
        .split(":")[0]
        .toLowerCase();
    if (!host.endsWith(`.${rootDomain}`)) {
        return null;
    }
    const sub = host.slice(0, -(rootDomain.length + 1));
    if (!sub || sub === "www" || sub === "api") {
        return null;
    }
    return sub;
}

async function tryServeProductOg(req, res, next) {
    const ua = req.get("user-agent") || "";
    if (!BOT_UA.test(ua)) {
        return next();
    }

    const match = String(req.path || "").match(PRODUCT_PATH);
    if (!match) {
        return next();
    }

    const pathTenant = match[1] ? match[1].toLowerCase() : null;
    const productId = match[2];
    const hostTenant = tenantFromHost(req.hostname);
    const tenantSlug = hostTenant || pathTenant;
    if (!tenantSlug || !productId) {
        return next();
    }

    const ogUrl = `${apiTarget.replace(/\/$/, "")}/og/product/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productId)}`;
    try {
        const upstream = await fetch(ogUrl, {
            headers: {
                "user-agent": ua,
                accept: "text/html",
            },
        });
        if (!upstream.ok) {
            return next();
        }
        const html = await upstream.text();
        res
            .status(200)
            .set({
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=300",
                "X-Robots-Tag": "noindex",
            })
            .send(html);
    } catch (error) {
        console.error("OG proxy failed:", error);
        return next();
    }
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

app.use(express.static(distDir));

app.get(/.*/, tryServeProductOg, (_req, res) => {
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
