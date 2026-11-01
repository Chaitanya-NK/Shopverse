import { test as base, expect, type Browser, type Page } from "@playwright/test";

/**
 * Every test gets its own client address (the proxy's rate limits count per
 * address, and all tests come from one machine), and fails on any uncaught
 * page error or console error.
 */
let counter = 0;
const nextAddress = () => `10.77.${Math.floor(++counter / 250)}.${(counter % 250) + 1}`;

const IGNORED = [/Failed to load resource/, /favicon/, /Download the React DevTools/];

function watch(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !IGNORED.some((re) => re.test(message.text())))
      errors.push(`${page.url()}: ${message.text().slice(0, 300)}`);
  });
}

type Fixtures = {
  /** A shopper with no session, in a separate browser context. */
  shopper: Page;
  pageErrors: string[];
};

async function guest(browser: Browser, headers: Record<string, string>, errors: string[]) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: headers,
  });
  const page = await context.newPage();
  watch(page, errors);
  return page;
}

export const test = base.extend<Fixtures>({
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-forwarded-for": nextAddress() });
  },
  pageErrors: [
    async ({}, use) => {
      const errors: string[] = [];
      await use(errors);
      expect(errors, "errors in the browser").toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page, pageErrors }, use) => {
    watch(page, pageErrors);
    await use(page);
  },
  shopper: async ({ browser, extraHTTPHeaders, pageErrors }, use) => {
    const page = await guest(browser, extraHTTPHeaders ?? {}, pageErrors);
    await use(page);
    await page.context().close();
  },
});

export { expect };

/** Wait for a toast containing `text`. */
export async function toast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).last()).toBeVisible();
}
