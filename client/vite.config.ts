import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const LOCAL_API = "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const proxyTarget = env.API_PROXY_TARGET?.trim() || LOCAL_API;

    const apiProxy = {
        "/api": {
            target: proxyTarget,
            changeOrigin: true,
            secure: true,
            rewrite: (path: string) => path.replace(/^\/api/, ""),
        },
    };

    return {
        plugins: [react()],
        server: { proxy: apiProxy },
        preview: { proxy: apiProxy },
    };
});
