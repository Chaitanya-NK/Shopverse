import { describe, expect, it } from "vitest";

import { can } from "./permissions";

describe("can", () => {
  it("lets owners do everything", () => {
    expect(can("owner", "shops.delete")).toBe(true);
    expect(can("owner", "organization.billing")).toBe(true);
  });

  it("limits billing to owners", () => {
    expect(can("admin", "organization.billing")).toBe(false);
  });

  it("lets staff adjust stock but not create shops", () => {
    expect(can("staff", "inventory.adjust")).toBe(true);
    expect(can("staff", "shops.create")).toBe(false);
  });

  it("denies everything without a role", () => {
    expect(can(null, "orders.manage")).toBe(false);
    expect(can(undefined, "audit.read")).toBe(false);
  });
});
