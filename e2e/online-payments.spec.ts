import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { sql } from "./support/db";
import { app, ORG } from "./support/env";
import { test, expect, toast } from "./support/fixtures";
import { addToCart, asha, checkOut } from "./support/flows";
import { now, waitForMail } from "./support/mail";

/**
 * Online payments on Shopverse's own pages, against the Stripe stand-in
 * (e2e/support/stripe-stub.mjs, started by Playwright): a shopper paying for
 * an order on the shop's payment page, and an owner paying for a plan.
 */
const org = `(select id from organizations where slug = '${ORG}')`;

function reset() {
  // Back to cash on delivery only, the trial plan, and no cached Stripe prices
  // (the stand-in forgets them between runs).
  sql(`delete from private.payment_accounts where organization_id = ${org}`);
  sql(`delete from platform_invoices where organization_id = ${org}`);
  sql(`delete from subscriptions where organization_id = ${org}`);
  sql(`delete from private.platform_provider_plans`);
  sql(`update organizations set plan = 'trial', plan_interval = null, plan_renews_at = null,
       trial_ends_at = now() + interval '14 days' where id = ${org}`);
}

/** Our own page's accessibility (Stripe's real fields come in their own frame). */
async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude("[data-stripe-stub]")
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

/** What our page handed to Stripe.js for styling its fields. */
const stripeOptions = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __stripeStub: { publishableKey: string; elementsOptions: never } })
        .__stripeStub,
  ) as Promise<{
    publishableKey: string;
    elementsOptions: {
      appearance: { variables: Record<string, string> };
      fonts: { cssSrc: string }[];
    };
  }>;

test.describe("online payments", () => {
  test.beforeAll(reset);
  test.afterAll(reset);

  test("a shopper pays on the shop's own payment page", async ({ page, shopper }) => {
    // The business connects its Stripe account, with the publishable key.
    await page.goto(app("/payments"));
    await page.getByLabel("Secret key").fill("sk_test_E2eShopKey00000001");
    await page.getByLabel("Publishable key").fill("pk_test_E2eShopKey00000001");
    await page.getByRole("button", { name: /Connect Stripe|Save and check key/ }).click();
    await toast(page, "Stripe connected in test mode");

    const who = asha("online");
    await addToCart(shopper, "classic-tee", "M");
    const order = await checkOut(shopper, who, undefined, "online");

    // Our page, in the shop's layout, with Stripe's fields inside it.
    await expect(shopper.getByRole("heading", { name: "Payment", level: 1 })).toBeVisible();
    await expect(shopper.getByText(order.number).first()).toBeVisible();
    await expect(shopper.getByText("Order summary")).toBeVisible();
    await expect(shopper.locator("[data-stripe-stub]")).toBeVisible();
    const options = await stripeOptions(shopper);
    expect(options.publishableKey).toBe("pk_test_E2eShopKey00000001");
    expect(options.elementsOptions.appearance.variables.colorPrimary).toMatch(/^#[0-9a-f]{6}$/);
    expect(options.elementsOptions.appearance.variables.borderRadius).toMatch(/px$/);
    await expectAccessible(shopper);

    // A declined card shows Stripe's message and keeps the shopper here.
    const pay = shopper.getByRole("button", { name: /^Pay ₹/ });
    await shopper.getByLabel("Decline this payment (test)").check();
    await pay.click();
    await expect(
      shopper.getByRole("alert").filter({ hasText: "Your card was declined." }),
    ).toBeVisible();
    await expect(shopper).toHaveURL(/\/pay$/);

    // Paying sends them back to the order, which confirms it with "Stripe".
    await shopper.getByLabel("Decline this payment (test)").uncheck();
    const since = now();
    const confirmed = shopper.waitForRequest((r) => r.url().endsWith("/js/confirm"));
    await pay.click();
    // The delivery name and address went to Stripe as the billing address.
    expect(JSON.parse((await confirmed).postData() ?? "{}").billingAddress).toEqual({
      name: who.name,
      address: {
        line1: "12 MG Road, Camp",
        city: "Pune",
        state: "Maharashtra",
        postal_code: "411001",
        country: "IN",
      },
    });
    await toast(shopper, "Payment received. Your order is confirmed.");
    await expect(shopper).toHaveURL(new RegExp(`/orders/${order.token}$`));
    expect(sql(`select status || ' ' || payment_status from orders where id = '${order.id}'`)).toBe(
      "confirmed paid",
    );
    await waitForMail(who.email, new RegExp(`Order ${order.number} confirmed`), since);

    // A paid order has nothing left to pay: its payment page goes to the order.
    await shopper.goto(`/s/e2e-threads/orders/${order.token}/pay`);
    await expect(shopper).toHaveURL(new RegExp(`/orders/${order.token}$`));
  });

  test("an owner pays for a plan on Shopverse's own page", async ({ page }) => {
    sql(`update organizations set billing_profile = '{"legal_name":"E2E Threads Pvt Ltd",
         "email":"billing@e2e-threads.test","state":"Karnataka"}' where id = ${org}`);
    await page.goto(app("/billing"));
    await page.getByRole("button", { name: "Choose Growth" }).first().click();
    await page.waitForURL(/\/billing\/subscribe\?plan=growth&interval=/);
    await expect(page.getByRole("heading", { name: "Subscribe to Growth" })).toBeVisible();
    await expect(page.locator("[data-stripe-stub]")).toBeVisible();
    expect((await stripeOptions(page)).publishableKey).toMatch(/^pk_test_/);
    await expectAccessible(page);

    await page.getByRole("button", { name: /^Pay ₹.* and subscribe$/ }).click();
    await page.waitForURL(new RegExp(`/app/${ORG}/billing(\\?|$)`));
    await expect(page.getByText("You're on this plan.").first()).toBeVisible();
    expect(sql(`select plan from organizations where id = ${org}`)).toBe("growth");
    expect(
      Number(sql(`select count(*) from platform_invoices where organization_id = ${org}`)),
    ).toBe(1);
  });
});
