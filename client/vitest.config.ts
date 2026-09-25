import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit/component tests (npm test). The API client is mocked in each test,
// so no backend is needed. End-to-end tests stay in e2e/ (Playwright).
export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
