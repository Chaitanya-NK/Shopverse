import { sql, lit } from "./support/db";
import { app, shop } from "./support/env";
import { test, expect, toast } from "./support/fixtures";
import { addToCart, asha, checkOut, fulfil, shopperSignIn } from "./support/flows";
import { now, waitForMail } from "./support/mail";

test("a shopper returns an item; staff approve, receive and refund it", async ({
  shopper,
  page,
}) => {
  const who = asha("return");
  await addToCart(shopper, "classic-tee", "M");
  const order = await checkOut(shopper, who);
  await fulfil(page, order.id);

  // Guests can't start a return; the account owner can.
  await shopper.context().clearCookies();
  await shopper.goto(shop(`/orders/${order.token}`));
  await expect(shopper.getByRole("link", { name: "Return or exchange" })).toHaveCount(0);
  await shopperSignIn(shopper, who.email, `/s/e2e-threads/orders/${order.token}`);
  await shopper.waitForURL(/\/orders\/[0-9a-f]{32}$/);

  const since = now();
  await shopper.getByRole("link", { name: "Return or exchange" }).click();
  await shopper.waitForURL(/\/return$/);
  await shopper.getByLabel("Reason").click();
  await shopper.getByRole("option", { name: "Doesn't fit" }).click();
  await shopper.getByLabel("UPI id for your refund").fill("asha@okaxis");
  await shopper.getByRole("button", { name: "Send request" }).click();
  await toast(shopper, /Request RET-\d+ sent/);
  await expect(shopper.getByText("We'll review your request soon.")).toBeVisible();
  const ret = sql(`select id || '|' || number from returns where order_id = ${lit(order.id)}`);
  const [returnId, returnNumber] = ret.split("|");
  await waitForMail(who.email, new RegExp(`Return ${returnNumber} requested`), since);

  // Staff handle it from the returns list.
  await page.goto(app("/returns"));
  await page.getByRole("link", { name: returnNumber }).click();
  await page.waitForURL(new RegExp(`/returns/${returnId}$`));
  await expect(page.getByText("asha@okaxis")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve return" }).click();
  await toast(page, "Return approved");
  await page.getByRole("button", { name: "Mark picked up" }).click();
  await toast(page, "Marked as picked up");

  const stock = () =>
    Number(
      sql(`select sum(on_hand) from inventory_overview where sku = 'E2E-TEE-M'
           and organization_id = (select id from organizations where slug = 'e2e-threads')`),
    );
  const before = stock();
  await page.getByRole("button", { name: "Receive items" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Receive" }).click();
  await toast(page, "Return received");
  expect(stock()).toBe(before + 1);

  await page.getByRole("button", { name: /Record refund of/ }).click();
  await page.getByRole("dialog").getByLabel("UPI transaction id (UTR)").fill("UTR4455667788");
  await page.getByRole("dialog").getByRole("button", { name: "Record refund" }).click();
  await toast(page, "Refund recorded");
  await expect(page.getByText("UTR4455667788")).toBeVisible();

  // A numbered GST credit note against the invoice.
  await page.getByRole("link", { name: /Credit note CN/ }).click();
  await expect(page.getByText("Against invoice")).toBeVisible();
  expect(sql(`select status from returns where id = ${lit(returnId!)}`)).toBe("completed");
});
