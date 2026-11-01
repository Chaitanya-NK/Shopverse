import { sql, lit } from "./support/db";
import { app, shop } from "./support/env";
import { test, expect } from "./support/fixtures";
import { addToCart, asha, checkOut } from "./support/flows";
import { now, waitForMail } from "./support/mail";

test.describe("checkout", () => {
  test("a guest orders with cash on delivery and gets a confirmation", async ({
    shopper,
    page,
  }) => {
    const who = asha("checkout");
    await addToCart(shopper, "classic-tee", "M");
    await shopper.goto(shop("/cart"));
    await expect(shopper.getByText("Classic cotton tee")).toBeVisible();

    const since = now();
    const order = await checkOut(shopper, who);
    await expect(shopper.getByText(order.number).first()).toBeVisible();

    // The confirmation goes out through the job queue.
    const mail = await waitForMail(who.email, new RegExp(`Order ${order.number} confirmed`), since);
    expect(mail.text).toContain("₹548, cash on delivery");
    expect(mail.text).toContain(`/s/e2e-threads/orders/${order.token}`);
    expect(sql(`select status from orders where id = ${lit(order.id)}`)).toBe("confirmed");

    // Staff see it in their order list.
    await page.goto(app("/orders"));
    await expect(page.getByRole("link", { name: order.number })).toBeVisible();
  });

  test("a wrong code is refused", async ({ shopper }) => {
    await addToCart(shopper, "rolled-oats");
    await shopper.goto(shop("/checkout"));
    await shopper.getByLabel("Full name").fill("Ravi Iyer");
    await shopper.getByLabel("Email").fill(`ravi-${Date.now().toString(36)}@example.com`);
    await shopper.getByLabel("Mobile number").fill("98000 00002");
    await shopper.getByLabel("House, street, area").fill("4 Lake Road");
    await shopper.getByLabel("City").fill("Chennai");
    await shopper.getByRole("combobox", { name: "State" }).click();
    await shopper.getByRole("option", { name: "Tamil Nadu" }).click();
    await shopper.getByLabel("PIN code").fill("600001");
    await shopper.getByRole("button", { name: "Email me a code to place the order" }).click();
    await expect(shopper.getByText("Check your email").filter({ visible: true })).toBeVisible();
    await shopper.keyboard.type("000000");
    await expect(shopper.getByText(/That code is not right\. \d+ tries? left\./)).toBeVisible();
    await expect(shopper).toHaveURL(/\/checkout/);
  });
});
