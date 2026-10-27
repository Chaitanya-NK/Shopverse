import { describe, expect, it } from "vitest";

import { includedTax, orderTotals } from "@/features/orders/totals";

describe("order totals", () => {
  it("extracts GST from inclusive prices", () => {
    expect(includedTax(1575, 5)).toBe(75);
    expect(includedTax(118, 18)).toBe(18);
    expect(includedTax(500, 0)).toBe(0);
  });

  it("matches the database's create_order arithmetic", () => {
    // Same order as the SQL test: phone at 0% + 3 tees at 525 (5%), ₹99 shipping, ₹525 off.
    expect(
      orderTotals(
        [
          { quantity: 1, unitPrice: 20000, gstRate: 0 },
          { quantity: 3, unitPrice: 525, gstRate: 5 },
        ],
        99,
        525,
      ),
    ).toEqual({ subtotal: 21575, tax: 75, shipping: 99, discount: 525, grandTotal: 21149 });
  });

  it("avoids floating point drift", () => {
    expect(orderTotals([{ quantity: 3, unitPrice: 0.1, gstRate: 0 }], 0, 0).subtotal).toBe(0.3);
  });
});
