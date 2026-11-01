/* eslint-disable no-console -- command-line script */
// Accessibility audit: runs axe-core (WCAG 2.2 A and AA rules) over the main
// storefront and staff pages, in light and dark mode, and lists every problem.
//
//   npm run audit:a11y                        # against http://localhost:3000
//   AUDIT_URL=https://… AUDIT_SHOP=my-shop npm run audit:a11y
//
// Staff pages need a signed-in session: set AUDIT_STAFF_COOKIE to the value of
// your sb-…-auth-token cookie (and AUDIT_COOKIE_NAME if it differs) plus
// AUDIT_ORG (the business handle). Exits with 1 when serious or critical
// problems are found. Needs a browser once: npx playwright install chromium.
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const base = (process.env.AUDIT_URL ?? "http://localhost:3000").replace(/\/$/, "");
const shop = process.env.AUDIT_SHOP ?? "urban-threads";
const org = process.env.AUDIT_ORG ?? "urban-threads";
const staffCookie = process.env.AUDIT_STAFF_COOKIE;
const cookieName = process.env.AUDIT_COOKIE_NAME ?? "sb-127-auth-token";

const storefront = [
  ["Shop home", `/s/${shop}`],
  ["All products", `/s/${shop}/products`],
  ["Search", `/s/${shop}/products?q=a`],
  ["Product", "FIRST_PRODUCT"],
  ["Cart (with an item)", "CART"],
  ["Checkout", `/s/${shop}/checkout`],
  ["Shopper sign-in", `/s/${shop}/account/sign-in`],
  ["Contact", `/s/${shop}/contact`],
  ["Hindi home", `/s/${shop}?lang=hi`],
];
const staff = [
  ["Staff sign-in", "/sign-in", false],
  ["Dashboard", `/app/${org}`],
  ["Orders", `/app/${org}/orders`],
  ["Products", `/app/${org}/products`],
  ["Inventory", `/app/${org}/inventory`],
  ["Customers", `/app/${org}/customers`],
  ["Marketing", `/app/${org}/marketing`],
  ["Shops", `/app/${org}/shops`],
  ["Analytics", `/app/${org}/analytics`],
];

const browser = await chromium.launch();
const results = [];

async function audit(context, name, path, scheme) {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  try {
    if (path === "FIRST_PRODUCT") {
      await page.goto(`${base}/s/${shop}`, { waitUntil: "networkidle" });
      const href = await page.locator(`a[href*="/s/${shop}/p/"]`).first().getAttribute("href");
      path = href ?? `/s/${shop}`;
    }
    if (path === "CART") {
      await page.goto(`${base}/s/${shop}/products?stock=true`, { waitUntil: "networkidle" });
      const href = await page.locator(`a[href*="/s/${shop}/p/"]`).first().getAttribute("href");
      if (href) {
        await page.goto(base + href, { waitUntil: "networkidle" });
        // Pick the first available option of each choice, then add.
        for (const group of await page.locator("fieldset").all())
          await group
            .locator("button:not([disabled])")
            .first()
            .click()
            .catch(() => {});
        await page
          .getByRole("button", { name: /add to cart/i })
          .click()
          .catch(() => {});
        await page.waitForTimeout(1500);
      }
      path = `/s/${shop}/cart`;
    }
    if (path.includes("lang=hi")) {
      await page.goto(`${base}/s/${shop}/language?to=hi&back=/s/${shop}`, {
        waitUntil: "networkidle",
      });
    } else {
      await page.goto(base + path, { waitUntil: "networkidle" });
    }
    await page.waitForTimeout(400);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude("nextjs-portal")
      .analyze();
    for (const v of violations)
      results.push({
        page: `${name} (${scheme})`,
        rule: v.id,
        impact: v.impact,
        help: v.help,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
        count: v.nodes.length,
      });
  } catch (error) {
    results.push({
      page: `${name} (${scheme})`,
      rule: "page-error",
      impact: "serious",
      help: String(error).slice(0, 200),
      targets: [],
      count: 1,
    });
  } finally {
    await page.close();
  }
}

for (const scheme of ["light", "dark"]) {
  const shopper = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const [name, path] of storefront) await audit(shopper, name, path, scheme);
  await shopper.close();

  const team = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (staffCookie) {
    const host = new URL(base).hostname;
    await team.addCookies([{ name: cookieName, value: staffCookie, domain: host, path: "/" }]);
  }
  for (const [name, path, needsSession = true] of staff)
    if (!needsSession || staffCookie) await audit(team, name, path, scheme);
  await team.close();
}
await browser.close();

if (results.length === 0) {
  console.log("No accessibility problems found.");
} else {
  for (const r of results)
    console.log(
      `[${r.impact}] ${r.page} · ${r.rule}: ${r.help} (${r.count}×)\n    ${r.targets.join("\n    ")}`,
    );
}
const serious = results.filter((r) => r.impact === "serious" || r.impact === "critical");
console.log(
  `\n${results.length} problem${results.length === 1 ? "" : "s"}, ${serious.length} serious or critical.`,
);
process.exit(serious.length > 0 ? 1 : 0);
