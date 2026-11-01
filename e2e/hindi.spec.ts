import { hi } from "../src/i18n/hi";
import { shop } from "./support/env";
import { test, expect } from "./support/fixtures";
import { addToCart, asha, checkOut } from "./support/flows";
import { now, waitForMail } from "./support/mail";

const t = (english: string) => hi[english] ?? english;

test("a shopper switches to Hindi, orders, and gets Hindi emails", async ({ shopper }) => {
  await shopper.goto(shop());
  await shopper.getByRole("link", { name: "हिन्दी" }).click();
  await expect(shopper.locator("html")).toHaveAttribute("lang", "hi");

  await addToCart(shopper, "classic-tee", "M", t);
  await shopper.goto(shop("/cart"));
  await expect(shopper.getByRole("link", { name: t("Checkout") }).first()).toBeVisible();

  const who = asha("hindi");
  const since = now();
  const order = await checkOut(shopper, who, t);
  const mail = await waitForMail(
    who.email,
    new RegExp(`ऑर्डर ${order.number} पक्का हो गया`),
    since,
  );
  expect(mail.subject).toContain("E2E Threads");

  // Back to English; the choice sticks across pages.
  await shopper.goto(shop());
  await shopper.getByRole("link", { name: "English" }).click();
  await expect(shopper.locator("html")).toHaveAttribute("lang", "en");
  await shopper.goto(shop("/products"));
  await expect(shopper.locator("html")).toHaveAttribute("lang", "en");
});
