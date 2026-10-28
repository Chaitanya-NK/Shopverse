import { type Invoice } from "@/features/invoices/schemas";
import { computeInvoiceTotals } from "@/features/invoices/tax";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type Tax = { taxable: number; cgst: number; sgst: number; igst: number };
const zero = (): Tax => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });
function add(into: Tax, from: Tax) {
  into.taxable += from.taxable;
  into.cgst += from.cgst;
  into.sgst += from.sgst;
  into.igst += from.igst;
}
function rounded<T extends Tax>(row: T): T {
  return {
    ...row,
    taxable: round2(row.taxable),
    cgst: round2(row.cgst),
    sgst: round2(row.sgst),
    igst: round2(row.igst),
  };
}

/** Supplies to unregistered buyers, by place of supply and rate (GSTR-1 table 7 shape). */
export type B2cRow = Tax & {
  placeOfSupply: string;
  stateCode: string | null;
  rate: number;
  invoices: number;
};

/** HSN-wise summary (GSTR-1 table 12 shape). */
export type HsnRow = Tax & {
  hsnCode: string | null;
  description: string;
  rate: number;
  quantity: number;
  value: number;
};

export type GstSummary = {
  invoices: number;
  firstNumber: string | null;
  lastNumber: string | null;
  totals: Tax & { value: number };
  b2c: B2cRow[];
  hsn: HsnRow[];
  /** Invoices from shops without a GSTIN: no tax is shown on these. */
  unregistered: number;
  /** Item lines without an HSN code (the HSN summary in GST returns needs one). */
  missingHsn: number;
};

/**
 * Summaries for a month's invoices, built from the same tax split as the
 * invoices themselves so the report always matches what customers received.
 */
export function summariseGst(invoices: Invoice[]): GstSummary {
  const b2c = new Map<string, B2cRow>();
  const hsn = new Map<string, HsnRow>();
  const hsnNames = new Map<string, Set<string>>();
  const totals = { ...zero(), value: 0 };
  let unregistered = 0;
  let missingHsn = 0;

  for (const invoice of invoices) {
    const t = computeInvoiceTotals(invoice);
    if (!t.registered) unregistered += 1;
    totals.value += t.total;
    const seenRates = new Set<number>();

    for (const line of t.lines) {
      add(totals, line);
      const place = t.placeOfSupply?.trim() || "Unknown";
      const key = `${place}|${line.rate}`;
      const row = b2c.get(key) ?? {
        ...zero(),
        placeOfSupply: place,
        stateCode: t.placeOfSupplyCode,
        rate: line.rate,
        invoices: 0,
      };
      add(row, line);
      if (!seenRates.has(line.rate)) {
        row.invoices += 1;
        seenRates.add(line.rate);
      }
      b2c.set(key, row);

      const isShipping = line.quantity === null;
      if (!isShipping && !line.hsnCode) missingHsn += 1;
      const code = line.hsnCode ?? null;
      // Lines without a code are kept apart by description rather than lumped together.
      const hKey = `${isShipping ? "shipping" : (code ?? `none:${line.description}`)}|${line.rate}`;
      const h = hsn.get(hKey) ?? {
        ...zero(),
        hsnCode: code,
        description: isShipping ? "Delivery charges" : line.description,
        rate: line.rate,
        quantity: 0,
        value: 0,
      };
      add(h, line);
      h.quantity += line.quantity ?? 0;
      h.value += line.total;
      hsn.set(hKey, h);
      const names = hsnNames.get(hKey) ?? new Set<string>();
      names.add(line.description);
      hsnNames.set(hKey, names);
    }
  }

  return {
    invoices: invoices.length,
    firstNumber: invoices[0]?.number ?? null,
    lastNumber: invoices.at(-1)?.number ?? null,
    totals: { ...rounded(totals), value: round2(totals.value) },
    b2c: [...b2c.values()]
      .map(rounded)
      .sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate),
    hsn: [...hsn.entries()]
      .map(([key, h]) => {
        // Several products under one code: name the first and count the rest.
        const names = hsnNames.get(key)!;
        const description =
          names.size > 1 ? `${h.description} + ${names.size - 1} more` : h.description;
        return { ...rounded(h), description, value: round2(h.value) };
      })
      // By code, then rate; delivery and lines without a code go last.
      .sort((a, b) => {
        const ka = a.hsnCode ?? "\uffff";
        const kb = b.hsnCode ?? "\uffff";
        return ka < kb ? -1 : ka > kb ? 1 : a.rate - b.rate;
      }),
    unregistered,
    missingHsn,
  };
}
