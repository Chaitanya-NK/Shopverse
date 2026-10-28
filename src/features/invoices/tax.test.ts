import { describe, expect, it } from "vitest";

import { type Invoice } from "@/features/invoices/schemas";
import { amountInWords, computeInvoiceTotals } from "@/features/invoices/tax";

const base: Invoice = {
  number: "MEGA2627-00001",
  issuedAt: "2026-10-27T10:00:00Z",
  orderNumber: "MEGA-000001",
  placedAt: "2026-10-26T10:00:00Z",
  paymentMethod: "cod",
  paymentStatus: "pending",
  currency: "INR",
  seller: {
    shopName: "Mega",
    legalName: "Mega Retail Pvt Ltd",
    gstin: "29ABCDE1234F1Z5",
    line1: "1 Residency Rd",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560025",
    email: null,
    phone: null,
  },
  buyer: {
    name: "Asha",
    phone: null,
    line1: null,
    line2: null,
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
  },
  subtotal: 1050,
  discountTotal: 0,
  discountCode: null,
  shippingTotal: 49,
  grandTotal: 1099,
  items: [
    {
      title: "Tee",
      sku: "TEE",
      hsnCode: "6109",
      quantity: 2,
      unitPrice: 525,
      total: 1050,
      gstRate: 5,
      taxAmount: 50,
      discountAmount: 0,
    },
  ],
};

describe("computeInvoiceTotals", () => {
  it("uses IGST across states, including on delivery at the item rate", () => {
    const t = computeInvoiceTotals(base);
    expect(t.intraState).toBe(false);
    expect(t.placeOfSupplyCode).toBe("27");
    expect(t.lines[0]).toMatchObject({ taxable: 1000, igst: 50, cgst: 0 });
    // 49 incl. 5%: tax 2.33, taxable 46.67
    expect(t.lines[1]).toMatchObject({
      description: "Delivery charges",
      rate: 5,
      taxable: 46.67,
      igst: 2.33,
    });
    expect(t.taxable + t.igst).toBeCloseTo(1099, 2);
  });

  it("splits CGST and SGST within the same state", () => {
    const t = computeInvoiceTotals({ ...base, buyer: { ...base.buyer, state: "Karnataka" } });
    expect(t.intraState).toBe(true);
    expect(t.lines[0]).toMatchObject({ cgst: 25, sgst: 25, igst: 0 });
    expect(t.cgst + t.sgst + t.taxable).toBeCloseTo(1099, 2);
  });

  it("splits odd paise without losing any", () => {
    const t = computeInvoiceTotals({
      ...base,
      shippingTotal: 0,
      buyer: { ...base.buyer, state: "Karnataka" },
      items: [{ ...base.items[0]!, taxAmount: 50.01 }],
    });
    expect(t.lines[0]!.cgst + t.lines[0]!.sgst).toBeCloseTo(50.01, 2);
  });

  it("shows no tax for an unregistered seller", () => {
    const t = computeInvoiceTotals({ ...base, seller: { ...base.seller, gstin: null } });
    expect(t.registered).toBe(false);
    expect(t.igst + t.cgst + t.sgst).toBe(0);
    expect(t.taxable).toBe(1099);
  });
});

describe("discounts on invoices", () => {
  it("taxes each line on its discounted value", () => {
    // 1050 - 105 (10% code) = 945 incl. 5% GST -> tax 45, taxable 900.
    const t = computeInvoiceTotals({
      ...base,
      discountTotal: 105,
      discountCode: "WELCOME10",
      grandTotal: 994,
      items: [{ ...base.items[0]!, discountAmount: 105, taxAmount: 45 }],
    });
    expect(t.lines[0]).toMatchObject({ discount: 105, taxable: 900, igst: 45, total: 945 });
    expect(t.lineDiscount).toBe(105);
    expect(t.extraDiscount).toBe(0);
    expect(t.taxable + t.igst).toBeCloseTo(994, 2);
  });

  it("keeps older order-level discounts as a separate line", () => {
    const t = computeInvoiceTotals({ ...base, discountTotal: 50, grandTotal: 1049 });
    expect(t.extraDiscount).toBe(50);
    expect(t.taxable + t.igst - t.extraDiscount).toBeCloseTo(1049, 2);
  });
});

describe("amountInWords", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [548, "Rupees Five Hundred Forty-Eight Only"],
    [1099.5, "Rupees One Thousand Ninety-Nine and Fifty Paise Only"],
    [125_000, "Rupees One Lakh Twenty-Five Thousand Only"],
    [10_00_00_001, "Rupees Ten Crore One Only"],
    [19_999.01, "Rupees Nineteen Thousand Nine Hundred Ninety-Nine and One Paise Only"],
  ])("%d", (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });
});
