/** Browser-facing API path only — real backend URL is set server-side via API_PROXY_TARGET. */
export const API_BASE_URL = "/api";

export const RAZORPAY_KEY_ID =
    import.meta.env.VITE_RAZORPAY_KEY_ID?.trim() || "";
