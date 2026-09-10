import { defineConfig } from "@playwright/test";

/**
 * Money-path E2E. Requires a running backend + frontend:
 *   backend:  uvicorn server:app --port 5000   (FCB_SECRET set)
 *   frontend: npm run dev                       (NEXT_PUBLIC_API_URL=http://localhost:5000)
 *
 * Run: `npx playwright test`
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
