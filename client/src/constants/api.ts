/**
 * Local dev: `/api` (Vite proxy via API_PROXY_TARGET).
 * Vercel: set VITE_API_URL=https://e-comm-h13q.onrender.com at build time
 * when /api rewrites are blocked (e.g. preview deployment protection).
 */
export const API_BASE_URL =
    import.meta.env.VITE_API_URL?.trim() || "/api";

export const RAZORPAY_KEY_ID =
    import.meta.env.VITE_RAZORPAY_KEY_ID?.trim() || "";

export { API_ENDPOINTS } from "../api/endpoints";
