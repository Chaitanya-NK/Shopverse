import type { Page } from "@playwright/test";

import { sql, lit } from "./db";
import { app, shop } from "./env";
import { expect, toast } from "./fixtures";
import { now, waitForCode } from "./mail";

type T = (english: string) => string;
const same: T = (s) => s;

/** Put one product in the cart from its page, choosing `option` if given. */
export async function addToCart(page: Page, product: string, option?: string, t: T = same) {
  await page.goto(shop(`/p/${product}`));
  if (option) await page.getByRole("button", { name: option, exact: true }).click();
  await page.getByRole("button", { name: t("Add to cart") }).click();
  await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
}

export type Shopper = { name: string; email: string; phone: string };

export const asha = (tag: string): Shopper => ({
  name: "Asha Rao",
  email: `asha+${tag}-${Date.now().toString(36)}@example.com`,
  phone: "98000 00001",
});

/**
 * Fill the guest checkout and confirm with the emailed code; returns the
 * order. Cash on delivery lands on the order page, online payment on the
 * payment page.
 */
export async function checkOut(
  page: Page,
  who: Shopper,
  t: T = same,
  method: "cod" | "online" = "cod",
) {
  await page.goto(shop("/checkout"));
  await page.getByLabel(t("Full name")).fill(who.name);
  await page.getByLabel(t("Email")).fill(who.email);
  await page.getByLabel(t("Mobile number")).fill(who.phone);
  await page.getByLabel(t("House, street, area")).fill("12 MG Road, Camp");
  await page.getByLabel(t("City")).fill("Pune");
  await page.getByRole("combobox", { name: t("State") }).click();
  await page.getByRole("option", { name: "Maharashtra" }).click();
  await page.getByLabel(t("PIN code")).fill("411001");
  // The choice only shows when the shop takes online payments too.
  const choice = page.getByRole("radio", {
    name: new RegExp(`^${t(method === "cod" ? "Cash on delivery" : "Pay online")}`),
  });
  if (await choice.count()) await choice.check();
  const since = now();
  await page
    .getByRole("button", {
      name: t(
        method === "cod" ? "Email me a code to place the order" : "Email me a code, then pay",
      ),
    })
    .click();
  await expect(page.getByText(t("Check your email")).filter({ visible: true })).toBeVisible();
  const code = await waitForCode(who.email, /order code|ऑर्डर कोड/, since);
  await page.keyboard.type(code);
  await page.waitForURL(
    method === "cod" ? /\/orders\/[0-9a-f]{32}$/ : /\/orders\/[0-9a-f]{32}\/pay$/,
  );
  const token = page.url().match(/\/orders\/([0-9a-f]{32})/)![1]!;
  const [id, number] = sql(
    `select id || '|' || number from orders where public_token = ${lit(token)}`,
  ).split("|");
  return { id: id!, number: number!, token };
}

/** A shopper signs in to their account with an emailed code. */
export async function shopperSignIn(page: Page, email: string, next?: string) {
  await page.goto(shop(`/account/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`));
  await page.getByLabel("Email").fill(email);
  const since = now();
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("Check your email").filter({ visible: true })).toBeVisible();
  await page.keyboard.type(await waitForCode(email, /sign-in code/, since));
}

const visible = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name }).filter({ visible: true }).first();

/** Staff pack, hand over, send out and deliver an order (with the delivery code). */
export async function fulfil(page: Page, orderId: string) {
  await page.goto(app(`/orders/${orderId}`));
  await visible(page, /^Ship \d+ from/).click();
  await page.getByRole("dialog").getByLabel("Courier (optional)").fill("Delhivery");
  await page.getByRole("dialog").getByRole("button", { name: "Pack shipment" }).click();
  await toast(page, "Shipment packed");
  await visible(page, "Picked up").click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark as picked up" }).click();
  await toast(page, "picked up");
  await visible(page, "Out for delivery").click();
  await page.getByRole("dialog").getByRole("button", { name: "Send out for delivery" }).click();
  const otp = (await page.getByTestId("delivery-otp").textContent())!.trim();
  await page.keyboard.press("Escape");
  await visible(page, "Enter delivery code").click();
  await page.keyboard.type(otp);
  await toast(page, "delivered");
  return otp;
}
