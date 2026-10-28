import { describe, expect, it } from "vitest";

import { summariseGst } from "@/features/analytics/gst";
import { type Invoice } from "@/features/invoices/schemas";

const seller: Invoice["seller"] = {
  shopName: "Mega",
  legalName: "Mega Retail Pvt Ltd",
  gstin: "29ABCDE1234F1Z5",
  line1: null,
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: null,
  email: null,
  phone: null,
};

function invoice(
  number: string,
  state: string,
  items: Partial<Invoice["items"][number]>[],
  shipping = 0,
): Invoice {
  const lines = items.map((i) => ({
    title: "Tee",
    sku: null,
    hsnCode: "6109",
    quantity: 1,
    unitPrice: 525,
    total: 525,
    gstRate: 5,
    taxAmount: 25,
    discountAmount: 0,
    ...i,
  }));
  const subtotal = lines.reduce((n, l) => n + l.total, 0);
  const discount = lines.reduce((n, l) => n + l.discountAmount, 0);
  return {
    number,
    issuedAt: "2026-09-10T10:00:00Z",
    orderNumber: number,
    placedAt: "2026-09-10T10:00:00Z",
    paymentMethod: "cod",
    paymentStatus: "paid",
    currency: "INR",
    seller,
    buyer: {
      name: null,
      phone: null,
      line1: null,
      line2: null,
      city: null,
      state,
      postalCode: null,
    },
    subtotal,
    discountTotal: discount,
    discountCode: null,
    shippingTotal: shipping,
    shippingRate: null,
    grandTotal: subtotal - discount + shipping,
    items: lines,
  };
}

describe("summariseGst", () => {
  it("groups B2C supplies by place of supply and rate, matching the invoices", () => {
    const s = summariseGst([
      invoice("A-1", "Karnataka", [{}], 49),
      invoice("A-2", "Maharashtra", [
        {},
        {
          title: "Shoes",
          hsnCode: "6403",
          total: 1180,
          unitPrice: 1180,
          gstRate: 18,
          taxAmount: 180,
        },
      ]),
      invoice("A-3", "Karnataka", [{ quantity: 2, total: 1050, taxAmount: 50 }]),
    ]);

    expect(s.invoices).toBe(3);
    expect(s.firstNumber).toBe("A-1");
    expect(s.lastNumber).toBe("A-3");

    const ka = s.b2c.find((r) => r.placeOfSupply === "Karnataka" && r.rate === 5)!;
    // 500 + 46.67 (delivery) + 1000; intra-state so CGST/SGST.
    expect(ka).toMatchObject({ stateCode: "29", invoices: 2, taxable: 1546.67, igst: 0 });
    expect(ka.cgst + ka.sgst).toBeCloseTo(77.33, 2);

    const mh18 = s.b2c.find((r) => r.placeOfSupply === "Maharashtra" && r.rate === 18)!;
    expect(mh18).toMatchObject({ taxable: 1000, igst: 180, cgst: 0, invoices: 1 });

    expect(s.totals.value).toBe(574 + 1705 + 1050);
    expect(round(s.totals.taxable + s.totals.cgst + s.totals.sgst + s.totals.igst)).toBe(
      s.totals.value,
    );
  });

  it("summarises by HSN with quantities, keeping delivery apart", () => {
    const s = summariseGst([
      invoice("A-1", "Karnataka", [{ quantity: 2, total: 1050, taxAmount: 50 }], 49),
      invoice("A-2", "Kerala", [{ quantity: 1, title: "Tee · L" }]),
    ]);
    const tee = s.hsn.find((h) => h.hsnCode === "6109")!;
    expect(tee).toMatchObject({
      description: "Tee + 1 more",
      quantity: 3,
      value: 1575,
      taxable: 1500,
      rate: 5,
    });
    const delivery = s.hsn.find((h) => h.description === "Delivery charges")!;
    expect(delivery).toMatchObject({ hsnCode: null, quantity: 0, value: 49 });
    expect(s.missingHsn).toBe(0);
    expect(s.hsn.at(-1)?.description).toBe("Delivery charges");
  });

  it("uses discounted values and flags gaps", () => {
    const s = summariseGst([
      invoice("A-1", "Karnataka", [{ hsnCode: null, discountAmount: 105, taxAmount: 20 }]),
      { ...invoice("A-2", "Karnataka", [{}]), seller: { ...seller, gstin: null } },
    ]);
    expect(s.missingHsn).toBe(1);
    expect(s.unregistered).toBe(1);
    const first = s.hsn.find((h) => h.hsnCode === null && h.description === "Tee")!;
    expect(first).toMatchObject({ value: 420, taxable: 400 });
  });

  it("handles an empty month", () => {
    expect(summariseGst([])).toMatchObject({ invoices: 0, firstNumber: null, b2c: [], hsn: [] });
  });
});

const round = (n: number) => Math.round(n * 100) / 100;

describe("summariseGst without HSN codes", () => {
  it("keeps different products apart", () => {
    const s = summariseGst([
      invoice("A-1", "Karnataka", [
        { hsnCode: null, title: "Tee" },
        { hsnCode: null, title: "Cap", total: 210, unitPrice: 210, taxAmount: 10 },
      ]),
    ]);
    expect(s.hsn.map((h) => h.description).sort()).toEqual(["Cap", "Tee"]);
    expect(s.missingHsn).toBe(2);
  });
});

describe("summariseGst with credit notes", () => {
  it("takes returns off the month's figures", () => {
    const sale = invoice("A-1", "Maharashtra", [{ quantity: 2, total: 1050, taxAmount: 50 }]);
    const credit = {
      ...invoice("CN-1", "Maharashtra", [{ quantity: 1, total: 525, taxAmount: 25 }]),
    };
    const s = summariseGst([sale], [credit]);
    expect(s.creditNotes).toMatchObject({
      count: 1,
      firstNumber: "CN-1",
      totals: { value: 525, taxable: 500, igst: 25 },
    });
    expect(s.totals).toMatchObject({ value: 525, taxable: 500, igst: 25 });
    expect(s.b2c).toEqual([
      expect.objectContaining({
        placeOfSupply: "Maharashtra",
        rate: 5,
        invoices: 1,
        taxable: 500,
        igst: 25,
      }),
    ]);
    expect(s.hsn[0]).toMatchObject({ hsnCode: "6109", quantity: 1, value: 525 });
  });
});
