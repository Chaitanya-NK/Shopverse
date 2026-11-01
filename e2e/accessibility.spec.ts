import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { sql } from "./support/db";
import { ORG, SHOP, app, shop } from "./support/env";
import { test, expect } from "./support/fixtures";
import { addToCart, asha, checkOut, fulfil, shopperSignIn } from "./support/flows";

/**
 * Accessibility: axe-core's WCAG 2.0–2.2 A and AA rules on every main page, in
 * light and dark mode. Any violation fails the test, with a list of what and
 * where. Run alone with `npm run audit:a11y`.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page, pages: [label: string, path: string][]) {
  const problems: string[] = [];
  for (const [label, path] of pages) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      const { violations } = await new AxeBuilder({ page })
        .withTags(TAGS)
        .exclude("nextjs-portal")
        .analyze();
      for (const v of violations)
        problems.push(
          `${label} (${colorScheme}) · ${v.impact} · ${v.id}: ${v.help}\n      ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(" "))
            .join("\n      ")}`,
        );
    }
  }
  expect(problems, `accessibility problems:\n${problems.join("\n")}`).toEqual([]);
}

const id = (query: string) => sql(query);
const orgId = () => id(`select id from organizations where slug = '${ORG}'`);
const shopId = () => id(`select id from shops where slug = '${SHOP}'`);

test.describe("accessibility", () => {
  test("storefront pages", async ({ shopper }) => {
    await addToCart(shopper, "classic-tee", "M");
    await audit(shopper, [
      ["Home", shop()],
      ["All products", shop("/products")],
      ["Search", shop("/products?q=tee")],
      ["Product", shop("/p/classic-tee")],
      ["Cart", shop("/cart")],
      ["Checkout", shop("/checkout")],
      ["Shopper sign-in", shop("/account/sign-in")],
      ["Contact", shop("/contact")],
      ["Offline", shop("/offline")],
    ]);
    await shopper.goto(shop(`/language?to=hi&back=/s/${SHOP}`));
    await audit(shopper, [
      ["Hindi home", shop()],
      ["Hindi product", shop("/p/classic-tee")],
      ["Hindi checkout", shop("/checkout")],
    ]);
  });

  test("shopper account pages", async ({ shopper }) => {
    const who = asha("a11y");
    await addToCart(shopper, "rolled-oats");
    const order = await checkOut(shopper, who);
    await shopper.context().clearCookies();
    await shopperSignIn(shopper, who.email);
    await shopper.waitForURL(/\/account/);
    await audit(shopper, [
      ["Order", shop(`/orders/${order.token}`)],
      ["My orders", shop("/account")],
      ["Profile", shop("/account/profile")],
      ["Addresses", shop("/account/addresses")],
      ["Wishlist", shop("/account/wishlist")],
    ]);
  });

  test("staff pages: selling", async ({ page }) => {
    const order = id(
      `select id from orders where organization_id = '${orgId()}' order by created_at desc limit 1`,
    );
    const customer = id(`select id from customers where organization_id = '${orgId()}' limit 1`);
    await audit(page, [
      ["Dashboard", app()],
      ["Orders", app("/orders")],
      ["New order", app("/orders/new")],
      ["Order", app(`/orders/${order}`)],
      ["Deliveries", app("/deliveries")],
      ["Returns", app("/returns")],
      ["Customers", app("/customers")],
      ["Customer", app(`/customers/${customer}`)],
      ["Discounts", app("/discounts")],
      ["Marketing", app("/marketing")],
      ["Reviews", app("/reviews")],
      ["Analytics", app("/analytics")],
      ["GST reports", app("/analytics/gst")],
    ]);
  });

  test("staff pages: catalogue and stock", async ({ page }) => {
    const product = id(
      `select id from products where organization_id = '${orgId()}' and slug = 'classic-tee'`,
    );
    await audit(page, [
      ["Products", app("/products")],
      ["New product", app("/products/new")],
      ["Product", app(`/products/${product}`)],
      ["Import products", app("/products/import")],
      ["Barcode labels", app("/products/labels")],
      ["Categories", app("/categories")],
      ["Collections", app("/collections")],
      ["Inventory", app("/inventory")],
      ["Warehouses", app("/warehouses")],
      ["Purchasing", app("/purchasing")],
      ["New purchase order", app("/purchasing/new")],
      ["Suppliers", app("/purchasing/suppliers")],
    ]);
  });

  test("staff pages: shops and settings", async ({ page }) => {
    await audit(page, [
      ["Shops", app("/shops")],
      ["Shop settings", app(`/shops/${shopId()}`)],
      ["Brand", app(`/shops/${shopId()}/brand`)],
      ["Domain", app(`/shops/${shopId()}/domain`)],
      ["Design editor", app(`/shops/${shopId()}/design`)],
      ["Team", app("/team")],
      ["Audit log", app("/team/audit")],
      ["Billing", app("/billing")],
      ["Payments", app("/payments")],
      ["WhatsApp & SMS", app("/settings/messaging")],
      ["Operations settings", app("/settings/operations")],
      ["Staff sign-in", "/sign-in"],
    ]);
  });

  test("delivered order, invoices and returns", async ({ page, shopper }) => {
    const who = asha("a11y-return");
    await addToCart(shopper, "classic-tee", "L");
    const order = await checkOut(shopper, who);
    await fulfil(page, order.id);
    const shipment = id(`select id from shipments where order_id = '${order.id}' limit 1`);
    await shopper.context().clearCookies();
    await shopperSignIn(shopper, who.email, shop(`/orders/${order.token}`));
    await shopper.waitForURL(/\/orders\/[0-9a-f]{32}$/);
    await audit(shopper, [
      ["Delivered order", shop(`/orders/${order.token}`)],
      ["Invoice (shopper)", shop(`/orders/${order.token}/invoice`)],
      ["Return form", shop(`/orders/${order.token}/return`)],
    ]);
    await shopper.getByLabel("Reason").click();
    await shopper.getByRole("option", { name: "Doesn't fit" }).click();
    await shopper.getByLabel("UPI id for your refund").fill("asha@okaxis");
    await shopper.getByRole("button", { name: "Send request" }).click();
    await shopper.waitForURL(/\/orders\/[0-9a-f]{32}$/);
    const ret = id(`select id from returns where order_id = '${order.id}'`);
    await audit(page, [
      ["Delivered order (staff)", app(`/orders/${order.id}`)],
      ["Invoice (staff)", app(`/orders/${order.id}/invoice`)],
      ["Packing slip", app(`/shipments/${shipment}/packing-slip`)],
      ["Shipping label", app(`/shipments/${shipment}/label`)],
      ["Return", app(`/returns/${ret}`)],
    ]);
  });

  test("platform admin pages", async ({ page }) => {
    await audit(page, [
      ["Admin overview", "/admin"],
      ["Businesses", "/admin/businesses"],
      ["Business", `/admin/businesses/${orgId()}`],
      ["Errors", "/admin/errors"],
      ["Jobs", "/admin/jobs"],
    ]);
  });

  test("keyboard: skip link first, and shopping without a mouse", async ({ shopper }) => {
    await shopper.goto(shop("/p/classic-tee"));
    await shopper.waitForLoadState("networkidle");
    await shopper.keyboard.press("Tab");
    const skip = shopper.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await shopper.keyboard.press("Enter");
    await expect(shopper).toHaveURL(/#main$/);

    // Tab to the size, choose it, tab on to "Add to cart" and press it.
    const size = shopper.getByRole("button", { name: "L", exact: true });
    const add = shopper.getByRole("button", { name: "Add to cart" });
    for (let i = 0; i < 60 && !(await size.evaluate((el) => el === document.activeElement)); i++)
      await shopper.keyboard.press("Tab");
    await expect(size).toBeFocused();
    await shopper.keyboard.press("Enter");
    for (let i = 0; i < 20 && !(await add.evaluate((el) => el === document.activeElement)); i++)
      await shopper.keyboard.press("Tab");
    await expect(add).toBeFocused();
    await shopper.keyboard.press("Enter");
    await expect(shopper.locator("[data-sonner-toast]").first()).toBeVisible();
  });
});
