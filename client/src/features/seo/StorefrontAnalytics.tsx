import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useStorefrontTenant } from "../tenant/useTenant";
import {
    readStoreAnalytics,
    trackPageView,
    trackPurchaseOnce,
} from "./storeAnalytics";

const THANK_YOU_PATH = /\/thank-you\/([^/?#]+)\/?$/i;

/** Orders are charged in INR (Razorpay / COD); display currency is cosmetic. */
const ORDER_CURRENCY = "INR";

/**
 * Store-owned GA4 / Meta Pixel. Mounted only inside the storefront layout, so
 * the admin panel and platform pages never load these tags. Renders nothing.
 */
export default function StorefrontAnalytics() {
    const { tenant } = useStorefrontTenant();
    const location = useLocation();
    const ga4 = readStoreAnalytics(tenant).ga4MeasurementId;
    const pixel = readStoreAnalytics(tenant).metaPixelId;
    const ids = useMemo(
        () => ({ ga4MeasurementId: ga4, metaPixelId: pixel }),
        [ga4, pixel],
    );
    const { pathname } = location;
    const state = location.state as { amount?: unknown } | null;
    const amount = typeof state?.amount === "number" ? state.amount : null;

    useEffect(() => {
        if (!ids.ga4MeasurementId && !ids.metaPixelId) {
            return;
        }
        // Let the lazily loaded page set document.title first.
        const timer = window.setTimeout(() => trackPageView(ids), 300);
        return () => window.clearTimeout(timer);
    }, [ids, pathname]);

    useEffect(() => {
        const match = pathname.match(THANK_YOU_PATH);
        if (!match || amount === null) {
            return;
        }
        trackPurchaseOnce(ids, {
            orderId: decodeURIComponent(match[1]),
            value: amount,
            currency: ORDER_CURRENCY,
        });
    }, [ids, pathname, amount]);

    return null;
}
