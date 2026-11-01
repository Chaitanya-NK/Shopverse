import "server-only";

import { cache } from "react";
import { z } from "zod";

import { type PoView, PO_VIEWS, type PurchaseOrderStatus } from "@/features/purchasing/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  address: { line1: string; city: string; state: string; postalCode: string };
  paymentTerms: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  isActive: boolean;
};

const addressSchema = z
  .object({
    line1: z.string().catch(""),
    city: z.string().catch(""),
    state: z.string().catch(""),
    postalCode: z.string().catch(""),
  })
  .catch({ line1: "", city: "", state: "", postalCode: "" });

export const listSuppliers = cache(async (organizationId: string): Promise<Supplier[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, contact_name, email, phone, gstin, address, payment_terms, lead_time_days, notes, is_active",
    )
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw fromPostgrestError(error);
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    contactName: s.contact_name,
    email: s.email,
    phone: s.phone,
    gstin: s.gstin,
    address: addressSchema.parse(s.address ?? {}),
    paymentTerms: s.payment_terms,
    leadTimeDays: s.lead_time_days,
    notes: s.notes,
    isActive: s.is_active,
  }));
});

export type PurchaseOrderRow = {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  supplierName: string;
  warehouseName: string;
  expectedAt: string | null;
  total: number;
  lineCount: number;
  orderedQuantity: number;
  receivedQuantity: number;
  createdAt: string;
};

export const PO_PAGE_SIZE = 25;

export const listPurchaseOrders = cache(
  async (organizationId: string, view: PoView, page: number) => {
    const supabase = await createClient();
    const from = (Math.max(1, page) - 1) * PO_PAGE_SIZE;
    const { data, error, count } = await supabase
      .from("purchase_order_overview")
      .select(
        "id, number, status, supplier_name, warehouse_name, expected_at, total, line_count, ordered_quantity, received_quantity, created_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .in("status", [...PO_VIEWS[view].statuses])
      .order("created_at", { ascending: false })
      .range(from, from + PO_PAGE_SIZE - 1);
    if (error) throw fromPostgrestError(error);
    const total = count ?? 0;
    return {
      total,
      page: Math.max(1, page),
      pageCount: Math.max(1, Math.ceil(total / PO_PAGE_SIZE)),
      items: data.map((p): PurchaseOrderRow => ({
        id: p.id!,
        number: p.number!,
        status: p.status!,
        supplierName: p.supplier_name!,
        warehouseName: p.warehouse_name!,
        expectedAt: p.expected_at,
        total: Number(p.total),
        lineCount: p.line_count ?? 0,
        orderedQuantity: p.ordered_quantity ?? 0,
        receivedQuantity: p.received_quantity ?? 0,
        createdAt: p.created_at!,
      })),
    };
  },
);

export const countOpenPurchaseOrders = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const counts = await Promise.all(
    (Object.keys(PO_VIEWS) as PoView[]).map(async (view) => {
      const { count, error } = await supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", [...PO_VIEWS[view].statuses]);
      if (error) throw fromPostgrestError(error);
      return [view, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<PoView, number>;
});

export type PurchaseOrderLine = {
  id: string;
  variantId: string;
  sku: string;
  title: string;
  productTitle: string;
  barcode: string | null;
  tracking: "quantity" | "serial" | "batch";
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  taxRate: number;
};

export const getPurchaseOrder = cache(async (organizationId: string, id: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, number, status, supplier_id, warehouse_id, expected_at, supplier_reference, notes, subtotal, tax_total, total, ordered_at, received_at, closed_at, cancelled_at, created_at, purchase_order_items (id, variant_id, quantity, received_quantity, unit_cost, tax_rate, position, variant:product_variants!purchase_order_items_organization_id_variant_id_fkey (sku, title, barcode, product:products (title, tracking)))",
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) return null;
  const [supplier, warehouse] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, contact_name, email, phone, gstin, address")
      .eq("id", data.supplier_id)
      .single(),
    supabase
      .from("warehouses")
      .select("id, name, code, address")
      .eq("id", data.warehouse_id)
      .single(),
  ]);
  if (supplier.error) throw fromPostgrestError(supplier.error);
  if (warehouse.error) throw fromPostgrestError(warehouse.error);
  return {
    id: data.id,
    number: data.number,
    status: data.status,
    expectedAt: data.expected_at,
    supplierReference: data.supplier_reference,
    notes: data.notes,
    subtotal: Number(data.subtotal),
    taxTotal: Number(data.tax_total),
    total: Number(data.total),
    orderedAt: data.ordered_at,
    receivedAt: data.received_at,
    closedAt: data.closed_at ?? data.cancelled_at,
    createdAt: data.created_at,
    supplier: {
      id: supplier.data.id,
      name: supplier.data.name,
      contactName: supplier.data.contact_name,
      email: supplier.data.email,
      phone: supplier.data.phone,
      gstin: supplier.data.gstin,
      address: addressSchema.parse(supplier.data.address ?? {}),
    },
    warehouse: {
      id: warehouse.data.id,
      name: warehouse.data.name,
      code: warehouse.data.code,
      address: addressSchema.parse(warehouse.data.address ?? {}),
    },
    lines: [...data.purchase_order_items]
      .sort((a, b) => a.position - b.position)
      .map((i): PurchaseOrderLine => ({
        id: i.id,
        variantId: i.variant_id,
        sku: i.variant?.sku ?? "",
        title: i.variant?.title ?? "",
        productTitle: i.variant?.product?.title ?? "",
        barcode: i.variant?.barcode ?? null,
        tracking: i.variant?.product?.tracking ?? "quantity",
        quantity: i.quantity,
        receivedQuantity: i.received_quantity,
        unitCost: Number(i.unit_cost),
        taxRate: Number(i.tax_rate),
      })),
  };
});
export type PurchaseOrderDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>;

const suggestionSchema = z.array(
  z.object({
    variant_id: z.uuid(),
    sku: z.string(),
    variant_title: z.string(),
    product_title: z.string(),
    warehouse_id: z.uuid(),
    warehouse_name: z.string(),
    available: z.number(),
    reorder_point: z.number(),
    on_order: z.number(),
    suggested: z.number(),
    unit_cost: z.coerce.number().nullable(),
    tax_rate: z.coerce.number().nullable(),
    supplier_id: z.uuid().nullable(),
    supplier_name: z.string().nullable(),
  }),
);
export type ReorderSuggestion = z.output<typeof suggestionSchema>[number];

export const getReorderSuggestions = cache(
  async (organizationId: string, warehouseId?: string | null) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reorder_suggestions", {
      p_organization_id: organizationId,
      p_warehouse_id: warehouseId ?? undefined,
    });
    if (error) throw fromPostgrestError(error);
    return suggestionSchema.parse(data ?? []);
  },
);
