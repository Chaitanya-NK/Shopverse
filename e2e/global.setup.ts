import { mkdirSync } from "node:fs";

import { test as setup, expect } from "@playwright/test";

import { sql, sqlFile, lit } from "./support/db";
import { ORG, OWNER, SHOP_NAME } from "./support/env";
import { now, waitForCode } from "./support/mail";

/**
 * The owner signs up through the real screens (email code from Mailpit) and
 * creates the business; later runs sign in instead. Then the catalogue is
 * seeded and the session saved for the other tests.
 */
setup("owner account, business and catalogue", async ({ page }) => {
  const exists = sql(`select count(*) from public.organizations where slug = ${lit(ORG)}`) === "1";
  const since = now();

  if (!exists) {
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill(OWNER.name);
    await page.getByLabel("Work email").fill(OWNER.email);
    await page.getByRole("button", { name: "Create account" }).click();
  } else {
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill(OWNER.email);
    await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  }
  await page.waitForURL(/\/verify/);
  const code = await waitForCode(OWNER.email, /code|verify/i, since);
  await page.getByLabel("Verification code").fill(code);
  await page.waitForURL((url) => !url.pathname.startsWith("/verify"));

  if (!exists) {
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel("Business name").fill(SHOP_NAME);
    await expect(page.getByLabel("Workspace URL")).toHaveValue(ORG);
    for (const industry of ["Fashion", "Electronics", "Grocery"])
      await page.getByRole("checkbox", { name: new RegExp(`^${industry}`) }).check();
    await page.getByLabel("Shop name").fill(SHOP_NAME);
    await page.getByLabel("Warehouse name").fill("Bengaluru hub");
    await page.getByLabel("City").fill("Bengaluru");
    await page.getByRole("button", { name: "Create workspace" }).click();
  }
  await page.waitForURL(new RegExp(`/app/${ORG}$`));
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  sqlFile("e2e/seed.sql", { owner_email: OWNER.email });

  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "e2e/.auth/owner.json" });
});
