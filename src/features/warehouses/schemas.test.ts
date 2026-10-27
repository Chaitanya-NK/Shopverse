import { describe, expect, it } from "vitest";

import {
  createWarehouseSchema,
  formatWarehouseLocation,
  parseWarehouseAddress,
  warehouseCodeSchema,
} from "@/features/warehouses/schemas";

describe("warehouseCodeSchema", () => {
  it("upper-cases and trims codes", () => {
    expect(warehouseCodeSchema.parse("  blr-1 ")).toBe("BLR-1");
  });

  it.each(["A", "TOO-LONG-CODE-1", "BLR 1", "blr_1"])("rejects %s", (code) => {
    expect(warehouseCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("createWarehouseSchema", () => {
  const valid = {
    organizationSlug: "acme",
    name: "Bengaluru hub",
    code: "blr-1",
    address: { city: "Bengaluru", state: "Karnataka" },
    isActive: true,
    shopIds: [],
  };

  it("fills address defaults", () => {
    const parsed = createWarehouseSchema.parse(valid);
    expect(parsed.address).toEqual({
      line1: "",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "",
    });
    expect(parsed.code).toBe("BLR-1");
  });

  it("rejects non-uuid shop ids", () => {
    expect(createWarehouseSchema.safeParse({ ...valid, shopIds: ["nope"] }).success).toBe(false);
  });
});

describe("address helpers", () => {
  it("tolerates unexpected jsonb", () => {
    expect(parseWarehouseAddress(null).city).toBe("");
    expect(parseWarehouseAddress({ city: 42 }).city).toBe("");
  });

  it("formats city and state", () => {
    expect(formatWarehouseLocation(parseWarehouseAddress({ city: "Pune", state: "MH" }))).toBe(
      "Pune, MH",
    );
    expect(formatWarehouseLocation(parseWarehouseAddress({}))).toBe("");
  });
});
