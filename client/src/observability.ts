/**
 * Browser error tracking (Sentry). A complete no-op unless VITE_SENTRY_DSN is
 * set: the SDK is loaded with a dynamic import, so builds without a DSN never
 * download it.
 *
 * - Errors caught by the app's ErrorBoundary (and uncaught render errors) are
 *   reported through React 19's root error hooks — see `rootErrorHandlers`.
 * - Events are tagged with the current store (`store_slug`, `tenant_id`) while
 *   a storefront is loaded, from the Redux tenant slice.
 * - Tokens, OTPs, passwords and signatures are stripped from URLs and data.
 */
import type { ErrorInfo } from "react";

type SentryModule = typeof import("@sentry/react");

interface TenantLike {
    tenantId?: string;
    slug?: string;
}

interface StoreLike {
    getState(): unknown;
    subscribe(listener: () => void): () => void;
}

const FILTERED = "[Filtered]";
const SENSITIVE_SUBSTRING = /password|passwd|secret|token|signature|authorization|cookie|apikey|credential/;
const SENSITIVE_WORDS = new Set(["otp", "cvv", "pwd", "auth"]);
const SECRET_QUERY = /([?&#](?:[a-z_-]*(?:token|password|secret|signature|otp|api_?key)[a-z_-]*|key|sig)=)[^&#\s]+/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const MAX_QUEUED_ERRORS = 10;

const env = import.meta.env;
const dsn = String(env.VITE_SENTRY_DSN ?? "").trim();

let sentry: SentryModule | null = null;
const queuedReactErrors: Array<[unknown, ErrorInfo]> = [];
let pendingTags: Record<string, string | undefined> = {};

export const observabilityEnabled = dsn.length > 0;

/** "newPassword", "X-Razorpay-Signature", "signupOtp" are sensitive; "hotpink" is not. */
export function isSensitiveKey(key: string): boolean {
    if (SENSITIVE_SUBSTRING.test(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
        return true;
    }
    const words = key.match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g) ?? [];
    return words.some((word) => SENSITIVE_WORDS.has(word.toLowerCase()));
}

export function scrubText(value: string): string {
    return value
        .replace(BEARER, (_m, scheme: string) => `${scheme} ${FILTERED}`)
        .replace(JWT, FILTERED)
        .replace(SECRET_QUERY, (_m, prefix: string) => `${prefix}${FILTERED}`);
}

export function scrubData<T>(value: T, depth = 0): T {
    if (depth > 12 || value == null) {
        return value;
    }
    if (typeof value === "string") {
        return scrubText(value) as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => scrubData(item, depth + 1)) as T;
    }
    if (typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            result[key] = isSensitiveKey(key) && item !== "" && item != null
                ? FILTERED
                : scrubData(item, depth + 1);
        }
        return result as T;
    }
    return value;
}

function sampleRate(): number {
    const parsed = Number.parseFloat(String(env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"));
    if (!Number.isFinite(parsed)) {
        return 0.1;
    }
    return Math.min(1, Math.max(0, parsed));
}

function setTags(tags: Record<string, string | undefined>): void {
    if (!sentry) {
        pendingTags = { ...pendingTags, ...tags };
        return;
    }
    for (const [key, value] of Object.entries(tags)) {
        sentry.setTag(key, value || undefined);
    }
}

function tenantFromState(state: unknown): TenantLike | null {
    const tenantState = (state as { tenant?: { currentTenant?: TenantLike | null; tenantSlug?: string } })
        ?.tenant;
    if (!tenantState) {
        return null;
    }
    if (tenantState.currentTenant) {
        return tenantState.currentTenant;
    }
    return tenantState.tenantSlug ? { slug: tenantState.tenantSlug } : null;
}

/** Keep `store_slug` / `tenant_id` tags in step with the loaded storefront. */
function bindStoreTags(store: StoreLike): void {
    let lastKey = "";
    const sync = () => {
        const tenant = tenantFromState(store.getState());
        const key = `${tenant?.slug ?? ""}|${tenant?.tenantId ?? ""}`;
        if (key === lastKey) {
            return;
        }
        lastKey = key;
        setTags({ store_slug: tenant?.slug, tenant_id: tenant?.tenantId });
    };
    sync();
    store.subscribe(sync);
}

/** Load and start Sentry when VITE_SENTRY_DSN is set; otherwise do nothing. */
export function initObservability(store?: StoreLike): void {
    if (!observabilityEnabled) {
        return;
    }
    if (store) {
        bindStoreTags(store);
    }
    void import("@sentry/react")
        .then((module) => {
            const options = {
                dsn,
                environment: String(env.VITE_SENTRY_ENVIRONMENT || env.MODE || "production"),
                release: env.VITE_SENTRY_RELEASE ? String(env.VITE_SENTRY_RELEASE) : undefined,
                // No user info, cookies or bodies; our beforeSend scrubs the rest.
                dataCollection: {
                    userInfo: false,
                    cookies: false,
                    httpBodies: [],
                },
                tracesSampleRate: sampleRate(),
            };
            module.init({
                ...options,
                // A plain array here would *replace* Sentry's defaults, which
                // include the handlers for uncaught errors and unhandled
                // promise rejections outside React (event handlers, timers,
                // network code) — the errors most worth catching in
                // production. Keep those and add tracing on top.
                integrations: [
                    ...module.getDefaultIntegrations(options),
                    module.browserTracingIntegration(),
                ],
                beforeSend(event) {
                    if (event.request) {
                        if (event.request.url) {
                            event.request.url = scrubText(event.request.url);
                        }
                        if (typeof event.request.query_string === "string") {
                            event.request.query_string = scrubText(`?${event.request.query_string}`).slice(1);
                        }
                        delete event.request.cookies;
                        event.request.headers = scrubData(event.request.headers);
                        event.request.data = undefined;
                    }
                    if (event.message) {
                        event.message = scrubText(event.message);
                    }
                    for (const exception of event.exception?.values ?? []) {
                        if (exception.value) {
                            exception.value = scrubText(exception.value);
                        }
                    }
                    event.extra = scrubData(event.extra);
                    event.contexts = scrubData(event.contexts);
                    return event;
                },
                beforeBreadcrumb(breadcrumb) {
                    if (breadcrumb.message) {
                        breadcrumb.message = scrubText(breadcrumb.message);
                    }
                    if (breadcrumb.data) {
                        breadcrumb.data = scrubData(breadcrumb.data);
                    }
                    return breadcrumb;
                },
            });
            sentry = module;
            setTags(pendingTags);
            pendingTags = {};
            for (const [error, info] of queuedReactErrors.splice(0)) {
                module.captureReactException(error, info);
            }
        })
        .catch((error: unknown) => {
            console.warn("Sentry could not be loaded.", error);
        });
}

function reportReactError(error: unknown, info: ErrorInfo): void {
    if (sentry) {
        sentry.captureReactException(error, info);
    } else if (queuedReactErrors.length < MAX_QUEUED_ERRORS) {
        queuedReactErrors.push([error, info]);
    }
}

/**
 * Options for `createRoot`: report errors React catches in an ErrorBoundary
 * and uncaught render errors. Empty (React's defaults) when Sentry is off.
 */
export function rootErrorHandlers(): {
    onCaughtError?: (error: unknown, info: ErrorInfo) => void;
    onUncaughtError?: (error: unknown, info: ErrorInfo) => void;
} {
    if (!observabilityEnabled) {
        return {};
    }
    return {
        onCaughtError(error, info) {
            reportReactError(error, info);
            console.error(error);
        },
        onUncaughtError(error, info) {
            reportReactError(error, info);
            console.error(error);
        },
    };
}
