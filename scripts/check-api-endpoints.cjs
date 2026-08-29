#!/usr/bin/env node
/**
 * Validates client/src/api/endpoints.ts against FastAPI routes in app/routes/*.py.
 *
 * Run from repo root:
 *   node scripts/check-api-endpoints.cjs
 *
 * Or from client/:
 *   npm run check:api
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ROUTES_DIR = path.join(ROOT, "app", "routes");
const ENDPOINTS_FILE = path.join(ROOT, "client", "src", "api", "endpoints.ts");
const MAIN_FILE = path.join(ROOT, "app", "main.py");
const CLIENT_SRC = path.join(ROOT, "client", "src");

function normalizePath(routePath) {
    let normalized = routePath.replace(/\/+/g, "/");
    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }
    return normalized;
}

function toPattern(routePath) {
    return normalizePath(routePath).replace(/\{[^}]+\}/g, ":param");
}

function joinPaths(prefix, routePath) {
    if (routePath === "" || routePath === "/") {
        return normalizePath(`${prefix}/`);
    }
    return normalizePath(`${prefix.replace(/\/$/, "")}/${routePath.replace(/^\//, "")}`);
}

function parseBackendRoutes() {
    const exact = new Set();
    const patterns = new Set();

    for (const fileName of fs.readdirSync(ROUTES_DIR)) {
        if (!fileName.endsWith(".py")) {
            continue;
        }

        const content = fs.readFileSync(path.join(ROUTES_DIR, fileName), "utf8");
        const prefixMatch = content.match(/prefix\s*=\s*["']([^"']+)["']/);
        if (!prefixMatch) {
            continue;
        }

        const prefix = prefixMatch[1];
        const routeRegex = /@router\.(?:get|post|put|patch|delete)\(\s*["']([^"']*)["']/g;
        let match = routeRegex.exec(content);

        while (match) {
            const fullPath = joinPaths(prefix, match[1]);
            exact.add(fullPath);
            exact.add(fullPath.replace(/\/$/, "") || "/");
            patterns.add(toPattern(fullPath));
            match = routeRegex.exec(content);
        }
    }

    const mainContent = fs.readFileSync(MAIN_FILE, "utf8");
    if (mainContent.includes('@app.get("/healthcheck")')) {
        exact.add("/healthcheck");
    }
    if (mainContent.includes('@app.get("/health")')) {
        exact.add("/health");
    }

    return { exact, patterns: [...patterns] };
}

function parseRegistryPaths() {
    const content = fs.readFileSync(ENDPOINTS_FILE, "utf8");
    const paths = new Set();

    const stringRegex = /["'](\/[^"']+)["']/g;
    let match = stringRegex.exec(content);
    while (match) {
        paths.add(normalizePath(match[1]));
        match = stringRegex.exec(content);
    }

    const templateRegex = /`(\/[^`]*?\$\{[^}]+\}[^`]*)`/g;
    match = templateRegex.exec(content);
    while (match) {
        paths.add(toPattern(match[1].replace(/\$\{[^}]+\}/g, ":param")));
        match = templateRegex.exec(content);
    }

    return [...paths];
}

function matchesBackend(registryPath, backend) {
    const candidates = new Set([
        registryPath,
        registryPath.replace(/\/$/, ""),
        `${registryPath.replace(/\/$/, "")}/`,
    ]);

    for (const candidate of candidates) {
        if (backend.exact.has(candidate)) {
            return true;
        }
    }

    const registryPattern = toPattern(registryPath);
    return backend.patterns.some((pattern) => pattern === registryPattern);
}

function findHardcodedClientPaths(dir) {
    const hits = [];
    const apiCallRegex = /apiClient\.(?:get|post|put|patch|delete)\(\s*["'`](\/[^"'`]+)["'`]/g;

    function walk(currentDir) {
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }
            if (!/\.(ts|tsx)$/.test(entry.name)) {
                continue;
            }

            const content = fs.readFileSync(fullPath, "utf8");
            let match = apiCallRegex.exec(content);
            while (match) {
                hits.push({
                    file: path.relative(ROOT, fullPath),
                    path: match[1],
                });
                match = apiCallRegex.exec(content);
            }
        }
    }

    walk(dir);
    return hits;
}

function main() {
    const backend = parseBackendRoutes();
    const registryPaths = parseRegistryPaths();
    const hardcoded = findHardcodedClientPaths(CLIENT_SRC);

    const missingOnBackend = registryPaths.filter(
        (registryPath) => !matchesBackend(registryPath, backend),
    );

    let failed = false;

    if (missingOnBackend.length > 0) {
        failed = true;
        console.error("API_ENDPOINTS entries with no matching backend route:");
        for (const routePath of missingOnBackend.sort()) {
            console.error(`  - ${routePath}`);
        }
        console.error("");
    }

    if (hardcoded.length > 0) {
        failed = true;
        console.error("Hardcoded apiClient paths (use API_ENDPOINTS instead):");
        for (const hit of hardcoded) {
            console.error(`  - ${hit.file}: ${hit.path}`);
        }
        console.error("");
    }

    if (failed) {
        console.error(
            "Fix app/routes/* and/or client/src/api/endpoints.ts, then re-run check:api.",
        );
        process.exit(1);
    }

    console.log(
        `API endpoint check passed (${registryPaths.length} registry paths, ${backend.exact.size} backend routes).`,
    );
}

main();
