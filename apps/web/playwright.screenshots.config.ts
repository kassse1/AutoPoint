import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// `npm run screenshots`: portfolio screenshots into docs/screenshots (not a test suite).
export default defineConfig({
  ...base,
  testDir: "./scripts",
  testMatch: "screenshots.spec.ts",
  globalSetup: undefined,
  retries: 0,
  reporter: "list",
});
