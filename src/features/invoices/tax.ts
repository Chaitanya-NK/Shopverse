import { type Invoice } from "@/features/invoices/schemas";
import { gstStateCode } from "@/features/orders/india";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type InvoiceLine = {
  description: string;
  hsnCode: string | null;
  quantity: number | null;
  rate: number;
  /** Value before tax. */
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** Value including tax (what the customer paid for the line). */
  total: number;
};

export type InvoiceTotals = {
  /** Seller registered for GST: show the tax split. */
  registered: boolean;
  /** Same state for seller and place of supply: CGST + SGST; otherwise IGST. */
  intraState: boolean;
  placeOfSupply: string | null;
  placeOfSupplyCode: string | null;
  lines: InvoiceLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount: number;
  total: number;
};

/** Split a GST-inclusive tax amount between CGST and SGST (or all IGST). */
function split(tax: number, intraState: boolean) {
  if (!intraState) return { cgst: 0, sgst: 0, igst: round2(tax) };
  const cgst = round2(tax / 2);
  return { cgst, sgst: round2(tax - cgst), igst: 0 };
}

/**
 * Tax breakdown for an invoice. Prices are GST-inclusive. Item tax is what was
 * recorded on the order. Delivery charges follow the principal supply, so they
 * carry the highest GST rate among the items (inclusive).
 */
export function computeInvoiceTotals(invoice: Invoice): InvoiceTotals {
  const registered = Boolean(invoice.seller.gstin);
  const placeOfSupply = invoice.buyer.state;
  const sellerCode = invoice.seller.gstin?.slice(0, 2) ?? gstStateCode(invoice.seller.state);
  const placeCode = gstStateCode(placeOfSupply);
  const intraState = !placeCode || !sellerCode || placeCode === sellerCode;

  const lines: InvoiceLine[] = invoice.items.map((item) => {
    const tax = registered ? item.taxAmount : 0;
    return {
      description: item.title,
      hsnCode: item.hsnCode,
      quantity: item.quantity,
      rate: registered ? item.gstRate : 0,
      taxable: round2(item.total - tax),
      ...split(tax, intraState),
      total: item.total,
    };
  });

  if (invoice.shippingTotal > 0) {
    const rate = registered ? Math.max(0, ...invoice.items.map((i) => i.gstRate)) : 0;
    const tax = round2((invoice.shippingTotal * rate) / (100 + rate));
    lines.push({
      description: "Delivery charges",
      // Part of a composite supply with the goods, not a separate service.
      hsnCode: null,
      quantity: null,
      rate,
      taxable: round2(invoice.shippingTotal - tax),
      ...split(tax, intraState),
      total: invoice.shippingTotal,
    });
  }

  const sum = (key: "taxable" | "cgst" | "sgst" | "igst") =>
    round2(lines.reduce((n, l) => n + l[key], 0));
  return {
    registered,
    intraState,
    placeOfSupply,
    placeOfSupplyCode: placeCode,
    lines,
    taxable: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    discount: invoice.discountTotal,
    total: invoice.grandTotal,
  };
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** Whole number in the Indian system: crore, lakh, thousand. */
function inWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${inWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** 1234.5 -> "Rupees One Thousand Two Hundred Thirty-Four and Fifty Paise Only". */
export function amountInWords(amount: number): string {
  const paise = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `Rupees ${inWords(rupees)}${rest ? ` and ${belowHundred(rest)} Paise` : ""} Only`;
}
