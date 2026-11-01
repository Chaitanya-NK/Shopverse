import { describe, expect, it } from "vitest";

import {
  parseSerials,
  purchaseOrderFormSchema,
  purchaseOrderTotals,
  supplierFormSchema,
} from "@/features/purchasing/schemas";

const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";

describe("purchasing schemas", () => {
  it("totals like the database: each line rounded, then summed", () => {
    expect(
      purchaseOrderTotals([
        { quantity: 20, unitCost: 210.5, taxRate: 5 },
        { quantity: 10, unitCost: 150, taxRate: 12 },
        { quantity: 2, unitCost: 15000, taxRate: 18 },
      ]),
    ).toEqual({ subtotal: 35710, tax: 5790.5, total: 41500.5 });
  });

  it("checks suppliers: blank optionals become null, GSTIN upper-cased", () => {
    const s = supplierFormSchema.parse({
      organizationSlug: "urban-threads",
      name: "Knits",
      gstin: "33abcde1234f1z5",
    });
    expect(s).toMatchObject({
      email: null,
      phone: null,
      gstin: "33ABCDE1234F1Z5",
      leadTimeDays: null,
    });
    expect(
      supplierFormSchema.safeParse({ organizationSlug: "urban-threads", name: "K" }).success,
    ).toBe(false);
    expect(
      supplierFormSchema.safeParse({
        organizationSlug: "urban-threads",
        name: "Knits",
        email: "nope",
      }).success,
    ).toBe(false);
  });

  it("needs lines, each product once, positive whole quantities", () => {
    const base = { organizationSlug: "urban-threads", supplierId: id, warehouseId: id2 };
    expect(purchaseOrderFormSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(
      purchaseOrderFormSchema.safeParse({
        ...base,
        lines: [
          { variantId: id, quantity: 1, unitCost: 1 },
          { variantId: id, quantity: 2, unitCost: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      purchaseOrderFormSchema.safeParse({
        ...base,
        lines: [{ variantId: id, quantity: 1.5, unitCost: 1 }],
      }).success,
    ).toBe(false);
    expect(
      purchaseOrderFormSchema.parse({
        ...base,
        lines: [{ variantId: id, quantity: "3", unitCost: "99.5" }],
      }).lines[0],
    ).toEqual({ variantId: id, quantity: 3, unitCost: 99.5, taxRate: 0 });
  });

  it("reads scanned serials", () => {
    expect(parseSerials(" IMEI1\nIMEI2, IMEI3 \n\n")).toEqual(["IMEI1", "IMEI2", "IMEI3"]);
  });
});
