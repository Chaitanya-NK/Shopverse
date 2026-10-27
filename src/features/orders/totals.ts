/**
 * Order arithmetic shared by the order form (live preview) and tests. The
 * database recomputes the same numbers in create_order(); prices are
 * GST-inclusive, so tax is the part of each line total that is GST.
 */

export type TotalsLine = { quantity: number; unitPrice: number; gstRate: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** GST contained in a GST-inclusive amount: 1575 at 5% -> 75. */
export function includedTax(amount: number, rate: number): number {
  if (rate <= 0) return 0;
  return round2((amount * rate) / (100 + rate));
}

export function orderTotals(lines: readonly TotalsLine[], shipping: number, discount: number) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  const tax = round2(
    lines.reduce((sum, l) => sum + includedTax(l.quantity * l.unitPrice, l.gstRate), 0),
  );
  const grandTotal = round2(Math.max(subtotal - discount, 0) + shipping);
  return { subtotal, tax, shipping: round2(shipping), discount: round2(discount), grandTotal };
}
