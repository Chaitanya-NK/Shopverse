import { sql, lit } from "./support/db";
import { shop } from "./support/env";
import { test, expect } from "./support/fixtures";
import { addToCart, asha, checkOut, fulfil } from "./support/flows";
import { now, waitForMail } from "./support/mail";

test("staff pack, ship and deliver an order with the delivery code", async ({ shopper, page }) => {
  const who = asha("fulfil");
  await addToCart(shopper, "classic-tee", "L");
  const order = await checkOut(shopper, who);

  const since = now();
  const otp = await fulfil(page, order.id);
  expect(otp).toMatch(/^\d{6}$/);

  // The shopper was emailed the same delivery code, then told it arrived.
  const codeMail = await waitForMail(who.email, /is your delivery code/, since);
  expect(codeMail.subject).toContain(otp);
  await waitForMail(who.email, /^Delivered/, since);
  expect(sql(`select status from orders where id = ${lit(order.id)}`)).toBe("completed");

  // A GST invoice was issued at dispatch.
  await page
    .getByRole("link", { name: /^Invoice / })
    .first()
    .click();
  await expect(page.getByText("Tax invoice")).toBeVisible();

  // The shopper's order page shows it delivered.
  await shopper.goto(shop(`/orders/${order.token}`));
  await expect(shopper.getByText("Delivered").first()).toBeVisible();

  // The public tracking page shows no personal details.
  const tracking = sql(
    `select tracking_token from shipments where order_id = ${lit(order.id)} limit 1`,
  );
  await shopper.goto(`/track/${tracking}`);
  await expect(shopper.getByText("Delivered").first()).toBeVisible();
  await expect(shopper.getByText(who.email)).toHaveCount(0);
});
