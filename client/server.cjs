const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiTarget = process.env.API_PROXY_TARGET?.trim();
if (!apiTarget) {
    console.error("Set API_PROXY_TARGET to your backend URL (e.g. in client/.env).");
    process.exit(1);
}
const distDir = path.join(__dirname, "dist");

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

app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
    console.log(`Client listening on port ${port}, API proxy -> ${apiTarget}`);
});
