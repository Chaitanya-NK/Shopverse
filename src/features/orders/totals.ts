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

/**
 * Spread an order discount over lines in proportion to their value (largest
 * first, the last line takes the rounding remainder), as the database does.
 */
export function allocateDiscount(lineTotals: readonly number[], discount: number): number[] {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const order = lineTotals
    .map((total, index) => ({ total, index }))
    .sort((a, b) => b.total - a.total);
  const shares = new Array<number>(lineTotals.length).fill(0);
  let left = round2(Math.min(discount, subtotal));
  order.forEach(({ total, index }, i) => {
    const share =
      i === order.length - 1 || subtotal === 0
        ? left
        : Math.min(left, round2((discount * total) / subtotal));
    shares[index] = round2(Math.min(share, total));
    left = round2(left - shares[index]!);
  });
  return shares;
}

export function orderTotals(lines: readonly TotalsLine[], shipping: number, discount: number) {
  const totals = lines.map((l) => l.quantity * l.unitPrice);
  const subtotal = round2(totals.reduce((sum, t) => sum + t, 0));
  // GST is on what each line is actually sold for, after its share of the discount.
  const shares = discount > 0 ? allocateDiscount(totals, discount) : totals.map(() => 0);
  const tax = round2(
    lines.reduce((sum, l, i) => sum + includedTax(totals[i]! - shares[i]!, l.gstRate), 0),
  );
  const grandTotal = round2(Math.max(subtotal - discount, 0) + shipping);
  return { subtotal, tax, shipping: round2(shipping), discount: round2(discount), grandTotal };
}
