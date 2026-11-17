import { defineConfig, devices } from "@playwright/test";

// E2E runs against the running Docker stack (`docker compose up -d --build --wait`):
// the production build of the site, the real API and PostgreSQL with the demo seed.
export default defineConfig({
  testDir: "./e2e",
  // One worker: tests share one database and the per-IP rate limits.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
    trace: "retain-on-failure",
  },
});
