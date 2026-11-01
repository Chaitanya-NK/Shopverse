import { sql } from "./support/db";
import { app, shop, SHOP } from "./support/env";
import { test, expect, toast } from "./support/fixtures";

test("staff design the storefront; shoppers see it only once published", async ({
  page,
  shopper,
}) => {
  const shopId = sql(`select id from shops where slug = '${SHOP}'`);
  sql(`delete from shop_designs where shop_id = '${shopId}'`); // start from the standard layout
  const question = `Do you deliver on Sundays? (${Date.now().toString(36)})`;

  const sidebar = page.getByRole("region", { name: "Design editor" }).locator("aside");
  const preview = page.frameLocator('iframe[title="Shop preview"]');
  const saved = () =>
    expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({
      timeout: 30_000,
    });

  await page.goto(app(`/shops/${shopId}/design`));
  await expect(sidebar.getByText("Using the standard layout.")).toBeVisible();

  // Start from a ready-made layout.
  await sidebar.getByRole("tab", { name: "Style" }).click();
  await sidebar.getByRole("button", { name: /^Bold/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Use this layout" }).click();
  await saved();
  await expect(preview.getByText("Best sellers")).toBeVisible({ timeout: 30_000 });

  // Add a questions section.
  await sidebar.getByRole("tab", { name: "Sections" }).click();
  await sidebar.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("dialog").getByPlaceholder("Search sections…").fill("Questions");
  await page
    .getByRole("option", { name: /^Questions & answers/ })
    .first()
    .click();
  await sidebar.getByRole("button", { name: "Add question" }).click();
  await sidebar.getByLabel("Question", { exact: true }).fill(question);
  await sidebar.getByLabel("Answer", { exact: true }).fill("Yes, every day of the week.");
  await sidebar.getByRole("button", { name: "Back to sections" }).click();
  await saved();
  await expect(preview.getByRole("button", { name: question })).toBeVisible({ timeout: 30_000 });

  // Drafts are for staff only.
  await shopper.goto(shop());
  await expect(shopper.getByText(question)).toHaveCount(0);

  await page.getByRole("button", { name: "Publish" }).click();
  await toast(page, "Published");

  await shopper.reload();
  await shopper.getByRole("button", { name: question }).click();
  await expect(shopper.getByText("Yes, every day of the week.")).toBeVisible();
  await expect(shopper.getByText("Best sellers")).toBeVisible();
});
