const DEFAULT_DEV_API_URL = "/api";

export const API_BASE_URL =
    import.meta.env.VITE_API_URL?.trim() || DEFAULT_DEV_API_URL;

export const RAZORPAY_KEY_ID =
    import.meta.env.VITE_RAZORPAY_KEY_ID?.trim() || "";
