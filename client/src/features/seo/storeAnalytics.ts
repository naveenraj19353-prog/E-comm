/**
 * Per-store GA4 + Meta Pixel for the storefront only.
 *
 * Ids come from the public tenant payload (`tenant.analytics`), are validated
 * again here, and nothing is loaded when they are empty. Page views are sent
 * manually on SPA route changes, so the automatic history-change tracking of
 * both tools is switched off (Pixel) or should be switched off in GA4
 * (Admin → Data streams → Enhanced measurement → "Page changes based on
 * browser history events") to avoid double counting.
 */

export type StoreAnalyticsIds = {
    ga4MeasurementId: string | null;
    metaPixelId: string | null;
};

export const GA4_ID_PATTERN = /^G-[A-Z0-9]{4,16}$/;
export const META_PIXEL_ID_PATTERN = /^[0-9]{5,20}$/;

export const normalizeGa4Id = (value: unknown): string | null => {
    const cleaned = String(value ?? "").trim().toUpperCase();
    return GA4_ID_PATTERN.test(cleaned) ? cleaned : null;
};

export const normalizeMetaPixelId = (value: unknown): string | null => {
    const cleaned = String(value ?? "").trim();
    return META_PIXEL_ID_PATTERN.test(cleaned) ? cleaned : null;
};

/** Read `analytics` off any tenant-shaped object (typed or not). */
export const readStoreAnalytics = (tenant: unknown): StoreAnalyticsIds => {
    const raw =
        tenant && typeof tenant === "object"
            ? (tenant as { analytics?: unknown }).analytics
            : null;
    const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
        ga4MeasurementId: normalizeGa4Id(data.ga4MeasurementId),
        metaPixelId: normalizeMetaPixelId(data.metaPixelId),
    };
};

type GtagFn = (...args: unknown[]) => void;

type FbqFn = ((...args: unknown[]) => void) & {
    callMethod?: (...args: unknown[]) => void;
    queue: unknown[];
    push: FbqFn;
    loaded: boolean;
    version: string;
    disablePushState?: boolean;
};

type AnalyticsWindow = Window & {
    dataLayer?: unknown[];
    gtag?: GtagFn;
    fbq?: FbqFn;
    _fbq?: FbqFn;
};

const analyticsWindow = (): AnalyticsWindow => window as AnalyticsWindow;

const injectScript = (src: string) => {
    if (document.querySelector(`script[src="${src}"]`)) {
        return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
};

const configuredGa4 = new Set<string>();
const initialisedPixels = new Set<string>();

const ensureGtag = (measurementId: string): GtagFn => {
    const w = analyticsWindow();
    w.dataLayer = w.dataLayer || [];
    if (!w.gtag) {
        // gtag.js expects the `arguments` object itself on the dataLayer.
        w.gtag = function gtag() {
            // eslint-disable-next-line prefer-rest-params
            w.dataLayer!.push(arguments);
        };
        w.gtag("js", new Date());
    }
    if (!configuredGa4.has(measurementId)) {
        configuredGa4.add(measurementId);
        injectScript(
            `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`,
        );
        w.gtag("config", measurementId, { send_page_view: false });
    }
    return w.gtag;
};

const ensurePixel = (pixelId: string): FbqFn => {
    const w = analyticsWindow();
    if (!w.fbq) {
        // Official Meta Pixel bootstrap: queue calls until fbevents.js loads.
        const fbq = ((...args: unknown[]) => {
            if (fbq.callMethod) {
                fbq.callMethod(...args);
            } else {
                fbq.queue.push(args);
            }
        }) as FbqFn;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = "2.0";
        fbq.queue = [];
        // We send PageView ourselves on route changes.
        fbq.disablePushState = true;
        w.fbq = fbq;
        if (!w._fbq) {
            w._fbq = fbq;
        }
        injectScript("https://connect.facebook.net/en_US/fbevents.js");
    }
    if (!initialisedPixels.has(pixelId)) {
        initialisedPixels.add(pixelId);
        w.fbq("init", pixelId);
    }
    return w.fbq;
};

/** Load the store's tags (idempotent). Returns false when nothing is configured. */
export const loadStoreAnalytics = (ids: StoreAnalyticsIds): boolean => {
    if (typeof window === "undefined") {
        return false;
    }
    if (ids.ga4MeasurementId) {
        ensureGtag(ids.ga4MeasurementId);
    }
    if (ids.metaPixelId) {
        ensurePixel(ids.metaPixelId);
    }
    return Boolean(ids.ga4MeasurementId || ids.metaPixelId);
};

export const trackPageView = (ids: StoreAnalyticsIds) => {
    if (!loadStoreAnalytics(ids)) {
        return;
    }
    const w = analyticsWindow();
    if (ids.ga4MeasurementId && w.gtag) {
        w.gtag("event", "page_view", {
            send_to: ids.ga4MeasurementId,
            page_location: window.location.href,
            page_path: window.location.pathname,
            page_title: document.title,
        });
    }
    if (ids.metaPixelId && w.fbq) {
        w.fbq("trackSingle", ids.metaPixelId, "PageView");
    }
};

export type PurchaseEvent = {
    orderId: string;
    value: number;
    currency: string;
};

const purchaseMemory = new Set<string>();

const purchaseKey = (orderId: string) => `rc_analytics_purchase:${orderId}`;

const alreadyTracked = (orderId: string): boolean => {
    if (purchaseMemory.has(orderId)) {
        return true;
    }
    try {
        return window.localStorage.getItem(purchaseKey(orderId)) === "1";
    } catch {
        return false;
    }
};

const markTracked = (orderId: string) => {
    purchaseMemory.add(orderId);
    try {
        window.localStorage.setItem(purchaseKey(orderId), "1");
    } catch {
        // Storage blocked: the in-memory set still stops repeats in this tab.
    }
};

/** Send purchase / Purchase once per order (survives refresh via localStorage). */
export const trackPurchaseOnce = (ids: StoreAnalyticsIds, purchase: PurchaseEvent): boolean => {
    if (!purchase.orderId || !Number.isFinite(purchase.value) || purchase.value < 0) {
        return false;
    }
    if (!ids.ga4MeasurementId && !ids.metaPixelId) {
        return false;
    }
    if (alreadyTracked(purchase.orderId)) {
        return false;
    }
    loadStoreAnalytics(ids);
    markTracked(purchase.orderId);
    const w = analyticsWindow();
    const value = Math.round(purchase.value * 100) / 100;
    if (ids.ga4MeasurementId && w.gtag) {
        w.gtag("event", "purchase", {
            send_to: ids.ga4MeasurementId,
            transaction_id: purchase.orderId,
            value,
            currency: purchase.currency,
        });
    }
    if (ids.metaPixelId && w.fbq) {
        w.fbq(
            "trackSingle",
            ids.metaPixelId,
            "Purchase",
            { value, currency: purchase.currency, order_id: purchase.orderId },
            { eventID: `purchase-${purchase.orderId}` },
        );
    }
    return true;
};
