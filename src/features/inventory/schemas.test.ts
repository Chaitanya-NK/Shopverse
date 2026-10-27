import { describe, expect, it } from "vitest";

import {
  parseSerials,
  receiveStockSchema,
  removeStockSchema,
  transferStockSchema,
} from "@/features/inventory/schemas";

const IDS = {
  variant: "6f1c7a3e-2b8d-4c1e-9a5f-0d2e3b4c5a6f",
  wh1: "7a2d8b4f-3c9e-4d2f-8b6a-1e3f4c5d6b7a",
  wh2: "8b3e9c5a-4d0f-4e3a-9c7b-2f4a5d6e7c8b",
  batch: "9c4f0d6b-5e1a-4f4b-8d8c-3a5b6e7f8d9c",
};
const org = { organizationSlug: "acme", variantId: IDS.variant };

describe("parseSerials", () => {
  it("splits on whitespace and commas, upper-cases and de-duplicates", () => {
    expect(parseSerials(" imei-1\nIMEI-2, imei-1\t imei-3 ;")).toEqual([
      "IMEI-1",
      "IMEI-2",
      "IMEI-3",
    ]);
    expect(parseSerials("   ")).toEqual([]);
  });
});

describe("receiveStockSchema", () => {
  it("requires what each tracking mode needs", () => {
    expect(
      receiveStockSchema.safeParse({
        ...org,
        tracking: "quantity",
        warehouseId: IDS.wh1,
        type: "receipt",
        quantity: "5",
      }).data,
    ).toMatchObject({ quantity: 5, note: null });

    const serial = receiveStockSchema.safeParse({
      ...org,
      tracking: "serial",
      warehouseId: IDS.wh1,
      type: "receipt",
      serials: [],
    });
    expect(serial.error?.issues[0]?.path).toEqual(["serials"]);

    const batch = receiveStockSchema.parse({
      ...org,
      tracking: "batch",
      warehouseId: IDS.wh1,
      type: "receipt",
      quantity: 10,
      batchCode: " b-jan ",
      expiryDate: "2027-01-31",
    });
    expect(batch).toMatchObject({ batchCode: "B-JAN", expiryDate: "2027-01-31" });
  });

  it("rejects fractional or zero quantities and bad serials", () => {
    for (const quantity of ["0", "1.5", "abc"]) {
      expect(
        receiveStockSchema.safeParse({
          ...org,
          tracking: "quantity",
          warehouseId: IDS.wh1,
          type: "receipt",
          quantity,
        }).success,
      ).toBe(false);
    }
    expect(
      receiveStockSchema.safeParse({
        ...org,
        tracking: "serial",
        warehouseId: IDS.wh1,
        type: "receipt",
        serials: ["A B"],
      }).success,
    ).toBe(false);
  });
});

describe("remove and transfer", () => {
  it("needs a batch for batch-tracked removals", () => {
    const result = removeStockSchema.safeParse({
      ...org,
      tracking: "batch",
      warehouseId: IDS.wh1,
      type: "damage",
      quantity: 1,
    });
    expect(result.error?.issues[0]?.path).toEqual(["batchId"]);
  });

  it("refuses transfers to the same warehouse", () => {
    const result = transferStockSchema.safeParse({
      ...org,
      tracking: "quantity",
      fromWarehouseId: IDS.wh1,
      toWarehouseId: IDS.wh1,
      quantity: 1,
    });
    expect(result.error?.issues[0]).toMatchObject({ path: ["toWarehouseId"] });
    expect(
      transferStockSchema.safeParse({
        ...org,
        tracking: "serial",
        fromWarehouseId: IDS.wh1,
        toWarehouseId: IDS.wh2,
        serials: ["IMEI-1"],
      }).success,
    ).toBe(true);
  });
});
