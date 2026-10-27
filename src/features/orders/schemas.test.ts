import { describe, expect, it } from "vitest";

import {
  addressSchema,
  createOrderSchema,
  moneySchema,
  phoneSchema,
} from "@/features/orders/schemas";

const VARIANT = "6f1c7a3e-2b8d-4c1e-9a5f-0d2e3b4c5a6f";
const SHOP = "7a2d8b4f-3c9e-4d2f-8b6a-1e3f4c5d6b7a";

const address = {
  name: "Asha Rao",
  phone: "+91 98000 00001",
  line1: "12 MG Road",
  city: "Pune",
  state: "Maharashtra",
  postalCode: "411001",
};

const order = (extra: Record<string, unknown> = {}) => ({
  organizationSlug: "acme",
  shopId: SHOP,
  customer: { fullName: "Asha", email: "", phone: "" },
  address,
  lines: [{ variantId: VARIANT, quantity: "2", unitPrice: "499" }],
  paymentMethod: "upi",
  paid: false,
  shippingTotal: "",
  discountTotal: "",
  notes: "",
  confirm: true,
  ...extra,
});

describe("order inputs", () => {
  it("normalises money and phones", () => {
    expect(moneySchema.parse("₹ 1,299.505")).toBe(1299.51);
    expect(moneySchema.parse("")).toBe(0);
    expect(moneySchema.safeParse("-1").success).toBe(false);
    expect(phoneSchema.parse("+91 98000-00001")).toBe("+919800000001");
    expect(phoneSchema.safeParse("12345").success).toBe(false);
  });

  it("checks Indian PIN codes", () => {
    expect(addressSchema.safeParse({ ...address, postalCode: "011001" }).success).toBe(false);
    expect(addressSchema.parse(address).line2).toBe("");
  });

  it("parses a complete order", () => {
    const parsed = createOrderSchema.parse(order());
    expect(parsed.lines[0]).toEqual({ variantId: VARIANT, quantity: 2, unitPrice: 499 });
    expect(parsed).toMatchObject({
      shippingTotal: 0,
      discountTotal: 0,
      customer: { phone: undefined },
    });
  });

  it("rejects duplicate lines, oversized discounts and prepaid COD", () => {
    const issues = (extra: Record<string, unknown>) =>
      createOrderSchema.safeParse(order(extra)).error?.issues.map((i) => i.path.join("."));
    expect(issues({ lines: [order().lines[0], order().lines[0]] })).toEqual(["lines"]);
    expect(issues({ discountTotal: "5000" })).toEqual(["discountTotal"]);
    expect(issues({ paymentMethod: "cod", paid: true })).toEqual(["paid"]);
  });
});
