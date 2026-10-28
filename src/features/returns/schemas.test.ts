import { describe, expect, it } from "vitest";

import {
  manualRefundSchema,
  returnFormSchema,
  reviewReturnSchema,
  toReturnItemsJson,
} from "@/features/returns/schemas";

const item = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const variant = "33333333-3333-4333-8333-333333333333";

const base = {
  lines: [
    { orderItemId: item, quantity: 1 },
    { orderItemId: other, quantity: 0 },
  ],
  reason: "size_fit" as const,
  resolution: "refund" as const,
};

describe("return form", () => {
  it("needs an item", () => {
    const r = returnFormSchema.safeParse({ ...base, lines: [{ orderItemId: item, quantity: 0 }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Choose at least one item");
  });

  it("asks for a UPI id on cash orders, and checks its shape", () => {
    expect(returnFormSchema.safeParse({ ...base, needsUpi: true }).success).toBe(false);
    expect(returnFormSchema.safeParse({ ...base, needsUpi: true, refundUpi: "asha" }).success).toBe(
      false,
    );
    expect(
      returnFormSchema.safeParse({ ...base, needsUpi: true, refundUpi: "asha.rao@okaxis" }).success,
    ).toBe(true);
    // Not needed for exchanges.
    expect(
      returnFormSchema.safeParse({
        ...base,
        needsUpi: true,
        resolution: "exchange",
        lines: [{ orderItemId: item, quantity: 1, exchangeVariantId: variant }],
      }).success,
    ).toBe(true);
  });

  it("needs an option for each exchanged item and a note for 'other'", () => {
    const ex = returnFormSchema.safeParse({ ...base, resolution: "exchange" });
    expect(ex.error?.issues[0]?.path).toEqual(["lines", 0, "exchangeVariantId"]);
    const other = returnFormSchema.safeParse({ ...base, reason: "other" });
    expect(other.error?.issues[0]?.path).toEqual(["note"]);
  });

  it("sends only chosen lines, with exchange options only for exchanges", () => {
    const lines = [
      { orderItemId: item, quantity: 2, exchangeVariantId: variant },
      { orderItemId: other, quantity: 0, exchangeVariantId: null },
    ];
    expect(toReturnItemsJson(lines, "refund")).toEqual([{ order_item_id: item, quantity: 2 }]);
    expect(toReturnItemsJson(lines, "exchange")).toEqual([
      { order_item_id: item, quantity: 2, exchange_variant_id: variant },
    ]);
  });
});

describe("staff inputs", () => {
  const ref = { organizationSlug: "urban-threads", returnId: item };
  it("declining needs a reason", () => {
    expect(reviewReturnSchema.safeParse({ ...ref, approve: false }).success).toBe(false);
    expect(reviewReturnSchema.safeParse({ ...ref, approve: true }).success).toBe(true);
  });
  it("manual refunds need a reference unless cash", () => {
    expect(manualRefundSchema.safeParse({ ...ref, method: "upi" }).success).toBe(false);
    expect(manualRefundSchema.safeParse({ ...ref, method: "cash" }).success).toBe(true);
    expect(
      manualRefundSchema.safeParse({ ...ref, method: "bank", reference: "NEFT123" }).success,
    ).toBe(true);
  });
});
