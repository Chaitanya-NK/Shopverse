import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (see e2e/README.md). They run against a production build on
 * port 3100, a local Supabase stack and its Mailpit inbox, which catches both
 * Supabase's sign-in emails and the app's own (SMTP_HOST=127.0.0.1:54325).
 */
const port = Number(process.env.E2E_PORT ?? 3100);
export const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  // The tests share one business and its stock, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "e2e/.report" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/owner.json" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${port}`,
        url: `${baseURL}/sign-in`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
      },
});
