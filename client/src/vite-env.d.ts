/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_RAZORPAY_KEY_ID?: string;
    /** Direct API origin for Vercel/production builds (optional) */
    readonly VITE_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
