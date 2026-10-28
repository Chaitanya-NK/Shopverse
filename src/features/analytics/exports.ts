import "server-only";

import { type CsvValue, csvFilename, toCsv } from "@/features/analytics/csv";
import { summariseGst } from "@/features/analytics/gst";
import { getMonthInvoices } from "@/features/analytics/queries";
import { addDays } from "@/features/analytics/ranges";
import { computeInvoiceTotals } from "@/features/invoices/tax";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const EXPORTS = [
  "orders",
  "customers",
  "stock",
  "gst-b2c",
  "gst-hsn",
  "gst-invoices",
] as const;
export type ExportKind = (typeof EXPORTS)[number];

export type CsvFile = { filename: string; body: string };

const PAGE = 1000;
const MAX_ROWS = 50_000;

/** Read every row of a query in pages (PostgREST caps a single response). */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await page(offset, offset + PAGE - 1);
    if (error) throw fromPostgrestError(error as Parameters<typeof fromPostgrestError>[0]);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const istTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/** "2026-10-27 14:05" in India time (spreadsheets sort it correctly). */
function ist(value: string | null): string {
  if (!value) return "";
  const parts = Object.fromEntries(
    istTime.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

const address = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
};

export async function ordersCsv(
  organizationId: string,
  range: { from: string; to: string },
  shopId: string | null,
): Promise<CsvFile> {
  const supabase = await createClient();
  const start = `${range.from}T00:00:00+05:30`;
  const end = `${addDays(range.to, 1)}T00:00:00+05:30`;
  const rows = await readAll((from, to) => {
    let q = supabase
      .from("orders")
      .select(
        "number, placed_at, status, fulfillment_status, payment_method, payment_status, subtotal, discount_total, discount_code, shipping_total, tax_total, grand_total, invoice_number, shipping_address, source, shop:shops(name), customer:customers(full_name, email, phone)",
      )
      .eq("organization_id", organizationId)
      .gte("placed_at", start)
      .lt("placed_at", end)
      .order("placed_at", { ascending: true })
      .range(from, to);
    if (shopId) q = q.eq("shop_id", shopId);
    return q;
  });
  const body = toCsv(
    [
      "Order",
      "Placed (IST)",
      "Shop",
      "Channel",
      "Status",
      "Fulfilment",
      "Payment method",
      "Payment status",
      "Customer",
      "Email",
      "Phone",
      "City",
      "State",
      "PIN code",
      "Items value",
      "Discount",
      "Discount code",
      "Delivery",
      "GST included",
      "Order total",
      "Invoice",
    ],
    rows.map((o): CsvValue[] => [
      o.number,
      ist(o.placed_at),
      o.shop?.name,
      o.source,
      o.status,
      o.fulfillment_status,
      o.payment_method,
      o.payment_status,
      o.customer?.full_name ?? address(o.shipping_address, "name"),
      o.customer?.email,
      o.customer?.phone ?? address(o.shipping_address, "phone"),
      address(o.shipping_address, "city"),
      address(o.shipping_address, "state"),
      address(o.shipping_address, "postal_code"),
      Number(o.subtotal),
      Number(o.discount_total),
      o.discount_code,
      Number(o.shipping_total),
      Number(o.tax_total),
      Number(o.grand_total),
      o.invoice_number,
    ]),
  );
  return { filename: csvFilename("orders", range.from, "to", range.to), body };
}

export async function customersCsv(organizationId: string): Promise<CsvFile> {
  const supabase = await createClient();
  const rows = await readAll((from, to) =>
    supabase
      .from("customer_overview")
      .select(
        "full_name, email, phone, orders_count, total_spent, last_order_at, created_at, accepts_marketing, tags",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .range(from, to),
  );
  const body = toCsv(
    [
      "Name",
      "Email",
      "Phone",
      "Orders",
      "Total spent",
      "Last order (IST)",
      "Customer since (IST)",
      "Accepts marketing",
      "Tags",
    ],
    rows.map((c): CsvValue[] => [
      c.full_name,
      c.email,
      c.phone,
      Number(c.orders_count ?? 0),
      Number(c.total_spent ?? 0),
      ist(c.last_order_at),
      ist(c.created_at),
      Boolean(c.accepts_marketing),
      (c.tags ?? []).join("; "),
    ]),
  );
  return { filename: csvFilename("customers"), body };
}

export async function stockCsv(organizationId: string): Promise<CsvFile> {
  const supabase = await createClient();
  const rows = await readAll((from, to) =>
    supabase
      .from("inventory_overview")
      .select(
        "product_title, variant_title, sku, category_name, warehouse_name, warehouse_code, on_hand, reserved, available, reorder_point, is_low, next_expiry",
      )
      .eq("organization_id", organizationId)
      .order("product_title", { ascending: true })
      .order("sku", { ascending: true })
      .range(from, to),
  );
  const body = toCsv(
    [
      "Product",
      "Variant",
      "SKU",
      "Category",
      "Warehouse",
      "Warehouse code",
      "On hand",
      "Reserved",
      "Available",
      "Reorder point",
      "Low stock",
      "Next expiry",
    ],
    rows.map((r): CsvValue[] => [
      r.product_title,
      r.variant_title,
      r.sku,
      r.category_name,
      r.warehouse_name,
      r.warehouse_code,
      Number(r.on_hand ?? 0),
      Number(r.reserved ?? 0),
      Number(r.available ?? 0),
      r.reorder_point === null ? null : Number(r.reorder_point),
      Boolean(r.is_low),
      r.next_expiry,
    ]),
  );
  return { filename: csvFilename("stock"), body };
}

export async function gstCsv(
  kind: "gst-b2c" | "gst-hsn" | "gst-invoices",
  organizationId: string,
  month: string,
  shopId: string | null,
): Promise<CsvFile> {
  const invoices = await getMonthInvoices(organizationId, month, shopId);

  if (kind === "gst-invoices") {
    const body = toCsv(
      [
        "Invoice",
        "Date (IST)",
        "Order",
        "Seller GSTIN",
        "Buyer",
        "Place of supply",
        "State code",
        "Taxable value",
        "CGST",
        "SGST",
        "IGST",
        "Discount",
        "Invoice value",
      ],
      invoices.map((inv): CsvValue[] => {
        const t = computeInvoiceTotals(inv);
        return [
          inv.number,
          ist(inv.issuedAt),
          inv.orderNumber,
          inv.seller.gstin,
          inv.buyer.name,
          t.placeOfSupply,
          t.placeOfSupplyCode,
          t.taxable,
          t.cgst,
          t.sgst,
          t.igst,
          t.lineDiscount + t.extraDiscount,
          t.total,
        ];
      }),
    );
    return { filename: csvFilename("invoices", month), body };
  }

  const summary = summariseGst(invoices);
  if (kind === "gst-b2c") {
    const body = toCsv(
      [
        "Place of supply",
        "State code",
        "Rate %",
        "Invoices",
        "Taxable value",
        "CGST",
        "SGST",
        "IGST",
      ],
      summary.b2c.map((r): CsvValue[] => [
        r.placeOfSupply,
        r.stateCode,
        r.rate,
        r.invoices,
        r.taxable,
        r.cgst,
        r.sgst,
        r.igst,
      ]),
    );
    return { filename: csvFilename("gst-b2c", month), body };
  }
  const body = toCsv(
    [
      "HSN",
      "Description",
      "Rate %",
      "Quantity",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
      "Total value",
    ],
    summary.hsn.map((r): CsvValue[] => [
      r.hsnCode,
      r.description,
      r.rate,
      r.quantity || null,
      r.taxable,
      r.cgst,
      r.sgst,
      r.igst,
      r.value,
    ]),
  );
  return { filename: csvFilename("gst-hsn", month), body };
}
