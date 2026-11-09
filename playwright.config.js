import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/browser/serve.js \"$RUNNER_TEMP/web-site\" \"$RUNNER_TEMP/dev-web-site\"",
    url: "http://127.0.0.1:4173/web/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
