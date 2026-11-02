import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (see e2e/README.md). They run against a production build on
 * port 3100, a local Supabase stack and its Mailpit inbox, which catches both
 * Supabase's sign-in emails and the app's own (SMTP_HOST=127.0.0.1:54325).
 */
const port = Number(process.env.E2E_PORT ?? 3100);
export const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const stripePort = Number(process.env.STRIPE_STUB_PORT ?? 12111);
const stripeStub = `http://127.0.0.1:${stripePort}`;

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
    : [
        {
          // A stand-in for Stripe (shop payments and plans): see e2e/support/stripe-stub.mjs.
          command: `node e2e/support/stripe-stub.mjs`,
          url: `${stripeStub}/health`,
          reuseExistingServer: !process.env.CI,
          env: { STRIPE_STUB_PORT: String(stripePort) },
        },
        {
          command: `npm run start -- -p ${port}`,
          url: `${baseURL}/sign-in`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          env: {
            STRIPE_API_URL: stripeStub,
            STRIPE_JS_URL: `${stripeStub}/js/basil/stripe.js`,
            PLATFORM_STRIPE_SECRET_KEY: "sk_test_E2ePlatformKey0001",
            PLATFORM_STRIPE_PUBLISHABLE_KEY: "pk_test_E2ePlatformKey0001",
            // Fixed test key for the businesses' saved Stripe keys.
            PAYMENTS_ENCRYPTION_KEY:
              process.env.PAYMENTS_ENCRYPTION_KEY ?? "ZTJlLXRlc3Qta2V5LWZvci1wbGF5d3JpZ2h0LW9ubHk=",
          },
        },
      ],
});
