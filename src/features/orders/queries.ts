import "server-only";

import { cache } from "react";

import { type AddressInput } from "@/features/orders/schemas";
import {
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ShipmentStatus,
} from "@/features/orders/schemas";
import { ORDERS_PAGE_SIZE } from "@/features/orders/search-params";
import { type Tracking } from "@/features/inventory/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { containsPattern } from "@/lib/postgrest";
import { createClient } from "@/lib/supabase/server";

export type OrderListItem = {
  id: string;
  number: string;
  shopName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  grandTotal: number;
  placedAt: string;
  customerName: string | null;
  city: string | null;
  itemCount: number;
};

export type OrderListFilters = {
  q: string;
  status: OrderStatus | null;
  payment: PaymentStatus | null;
  fulfillment: FulfillmentStatus | null;
  shopId: string | null;
  page: number;
};

export const listOrders = cache(async (organizationId: string, filters: OrderListFilters) => {
  const supabase = await createClient();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * ORDERS_PAGE_SIZE;

  let query = supabase
    .from("order_overview")
    .select(
      "id, number, shop_name, status, payment_status, payment_method, fulfillment_status, currency, grand_total, placed_at, customer_name, city, item_count",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  const q = filters.q.trim().toLowerCase().slice(0, 100);
  if (q) query = query.ilike("search_text", containsPattern(q));
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.payment) query = query.eq("payment_status", filters.payment);
  if (filters.fulfillment) query = query.eq("fulfillment_status", filters.fulfillment);
  if (filters.shopId) query = query.eq("shop_id", filters.shopId);

  const { data, error, count } = await query
    .order("placed_at", { ascending: false })
    .order("id")
    .range(from, from + ORDERS_PAGE_SIZE - 1);
  if (error) throw fromPostgrestError(error);

  const total = count ?? 0;
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)),
    items: data.map((o): OrderListItem => ({
      id: o.id,
      number: o.number,
      shopName: o.shop_name,
      status: o.status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      fulfillmentStatus: o.fulfillment_status,
      currency: o.currency,
      grandTotal: o.grand_total,
      placedAt: o.placed_at,
      customerName: o.customer_name,
      city: o.city,
      itemCount: Number(o.item_count ?? 0),
    })),
  };
});

/** Counts for the cards above the orders list. */
export const getOrderCounts = cache(async (organizationId: string, shopId: string | null) => {
  const supabase = await createClient();
  const count = (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => build(base());
  function base() {
    let q = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (shopId) q = q.eq("shop_id", shopId);
    return q;
  }

  const [pending, toShip, unpaidCod] = await Promise.all([
    count((q) => q.eq("status", "pending")),
    count((q) =>
      q.eq("status", "confirmed").in("fulfillment_status", ["unfulfilled", "partially_fulfilled"]),
    ),
    count((q) =>
      q.eq("status", "confirmed").eq("payment_method", "cod").neq("payment_status", "paid"),
    ),
  ]);
  for (const r of [pending, toShip, unpaidCod]) if (r.error) throw fromPostgrestError(r.error);
  return {
    pending: pending.count ?? 0,
    toShip: toShip.count ?? 0,
    codToCollect: unpaidCod.count ?? 0,
  };
});

// ---------------------------------------------------------------------------
// Order detail
// ---------------------------------------------------------------------------

export type OrderAddress = Required<AddressInput>;

export type OrderLine = {
  id: string;
  variantId: string | null;
  productId: string | null;
  title: string;
  sku: string;
  tracking: Tracking;
  quantity: number;
  fulfilledQuantity: number;
  unitPrice: number;
  total: number;
  gstRate: number;
  taxAmount: number;
  allocations: { warehouseId: string; warehouseName: string; quantity: number; shipped: number }[];
};

export type ShipmentDetail = {
  id: string;
  number: string;
  status: ShipmentStatus;
  warehouseId: string;
  warehouseName: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingToken: string;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  otpExpiresAt: string | null;
  otpAttempts: number;
  deliveryAttempts: number;
  createdAt: string;
  items: {
    orderItemId: string;
    title: string;
    sku: string;
    quantity: number;
    serials: string[];
    batches: string[];
  }[];
  events: {
    id: number;
    status: ShipmentStatus;
    description: string | null;
    location: string | null;
    occurredAt: string;
  }[];
};

export type OrderDetail = {
  id: string;
  number: string;
  shopId: string;
  shopName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  address: OrderAddress;
  notes: string | null;
  cancelReason: string | null;
  /** Set once the order has shipped (or completed). */
  invoiceNumber: string | null;
  /** Online orders: when the hold ends if unpaid. */
  paymentDueAt: string | null;
  placedAt: string;
  updatedAt: string;
  customer: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  lines: OrderLine[];
  shipments: ShipmentDetail[];
  events: { id: number; type: string; message: string; createdAt: string }[];
};

function toAddress(value: unknown): OrderAddress {
  const a = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  return {
    name: s("name"),
    phone: s("phone"),
    line1: s("line1"),
    line2: s("line2"),
    city: s("city"),
    state: s("state"),
    postalCode: s("postal_code"),
  };
}

export const getOrder = cache(
  async (organizationId: string, orderId: string): Promise<OrderDetail | null> => {
    const supabase = await createClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        `id, number, shop_id, status, payment_status, payment_method, fulfillment_status, currency,
       subtotal, discount_total, shipping_total, tax_total, grand_total, shipping_address, notes,
       cancel_reason, placed_at, updated_at, invoice_number, payment_due_at,
       shop:shops!orders_organization_id_shop_id_fkey (name),
       customer:customers (id, full_name, email, phone),
       order_items (id, variant_id, title, sku, tracking, quantity, fulfilled_quantity, unit_price, total, gst_rate, tax_amount, created_at,
         variant:product_variants (product_id))`,
      )
      .eq("organization_id", organizationId)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!order) return null;

    const [allocations, shipments, shipmentItems, shipmentEvents, events] = await Promise.all([
      supabase
        .from("order_allocations")
        .select(
          "order_item_id, warehouse_id, quantity, shipped_quantity, warehouse:warehouses!order_allocations_organization_id_warehouse_id_fkey (name)",
        )
        .eq("order_id", orderId),
      supabase
        .from("shipments")
        .select(
          "id, number, status, warehouse_id, carrier, tracking_number, tracking_token, estimated_delivery, shipped_at, delivered_at, otp_expires_at, otp_attempts, delivery_attempts, created_at, warehouse:warehouses!shipments_organization_id_warehouse_id_fkey (name)",
        )
        .eq("order_id", orderId)
        .order("created_at"),
      supabase
        .from("shipment_items")
        .select(
          "shipment_id, order_item_id, quantity, serial_numbers, batches, shipment:shipments!inner (order_id)",
        )
        .eq("shipment.order_id", orderId),
      supabase
        .from("shipment_events")
        .select(
          "id, shipment_id, status, description, location, occurred_at, shipment:shipments!inner (order_id)",
        )
        .eq("shipment.order_id", orderId)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false }),
      supabase
        .from("order_events")
        .select("id, type, message, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100),
    ]);
    for (const r of [allocations, shipments, shipmentItems, shipmentEvents, events]) {
      if (r.error) throw fromPostgrestError(r.error);
    }

    const lines = [...order.order_items].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lineById = new Map(lines.map((l) => [l.id, l]));

    return {
      id: order.id,
      number: order.number,
      shopId: order.shop_id,
      shopName: order.shop?.name ?? "",
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      fulfillmentStatus: order.fulfillment_status,
      currency: order.currency,
      subtotal: order.subtotal,
      discountTotal: order.discount_total,
      shippingTotal: order.shipping_total,
      taxTotal: order.tax_total,
      grandTotal: order.grand_total,
      address: toAddress(order.shipping_address),
      notes: order.notes,
      cancelReason: order.cancel_reason,
      invoiceNumber: order.invoice_number,
      paymentDueAt: order.payment_due_at,
      placedAt: order.placed_at,
      updatedAt: order.updated_at,
      customer: order.customer
        ? {
            id: order.customer.id,
            name: order.customer.full_name,
            email: order.customer.email,
            phone: order.customer.phone,
          }
        : null,
      lines: lines.map((l) => ({
        id: l.id,
        variantId: l.variant_id,
        productId: l.variant?.product_id ?? null,
        title: l.title,
        sku: l.sku,
        tracking: l.tracking,
        quantity: l.quantity,
        fulfilledQuantity: l.fulfilled_quantity,
        unitPrice: l.unit_price,
        total: l.total ?? l.quantity * l.unit_price,
        gstRate: l.gst_rate,
        taxAmount: l.tax_amount,
        allocations: (allocations.data ?? [])
          .filter((a) => a.order_item_id === l.id && a.quantity > 0)
          .map((a) => ({
            warehouseId: a.warehouse_id,
            warehouseName: a.warehouse?.name ?? "",
            quantity: a.quantity,
            shipped: a.shipped_quantity,
          })),
      })),
      shipments: (shipments.data ?? []).map((s) => ({
        id: s.id,
        number: s.number ?? "",
        status: s.status,
        warehouseId: s.warehouse_id,
        warehouseName: s.warehouse?.name ?? "",
        carrier: s.carrier,
        trackingNumber: s.tracking_number,
        trackingToken: s.tracking_token,
        estimatedDelivery: s.estimated_delivery,
        shippedAt: s.shipped_at,
        deliveredAt: s.delivered_at,
        otpExpiresAt: s.otp_expires_at,
        otpAttempts: s.otp_attempts,
        deliveryAttempts: s.delivery_attempts,
        createdAt: s.created_at,
        items: (shipmentItems.data ?? [])
          .filter((si) => si.shipment_id === s.id)
          .map((si) => ({
            orderItemId: si.order_item_id,
            title: lineById.get(si.order_item_id)?.title ?? "",
            sku: lineById.get(si.order_item_id)?.sku ?? "",
            quantity: si.quantity,
            serials: si.serial_numbers,
            batches: Array.isArray(si.batches)
              ? si.batches.flatMap((b) =>
                  typeof b === "object" && b !== null && "batch_code" in b
                    ? [`${String(b.batch_code)} ×${String(b.quantity)}`]
                    : [],
                )
              : [],
          })),
        events: (shipmentEvents.data ?? [])
          .filter((e) => e.shipment_id === s.id)
          .map((e) => ({
            id: e.id,
            status: e.status,
            description: e.description,
            location: e.location,
            occurredAt: e.occurred_at,
          })),
      })),
      events: (events.data ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        createdAt: e.created_at,
      })),
    };
  },
);

// ---------------------------------------------------------------------------
// Deliveries board
// ---------------------------------------------------------------------------

export type DeliveryRow = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  shopId: string;
  status: ShipmentStatus;
  carrier: string | null;
  trackingNumber: string | null;
  trackingToken: string;
  warehouseName: string;
  recipientName: string | null;
  recipientPhone: string | null;
  city: string | null;
  itemCount: number;
  codDue: number | null;
  currency: string;
  estimatedDelivery: string | null;
  updatedAt: string;
};

export const DELIVERIES_PAGE_SIZE = 50;

export const listDeliveries = cache(
  async (
    organizationId: string,
    statuses: readonly ShipmentStatus[],
    shopId: string | null,
    page: number,
  ) => {
    const supabase = await createClient();
    const from = (Math.max(1, page) - 1) * DELIVERIES_PAGE_SIZE;
    let query = supabase
      .from("shipment_overview")
      .select(
        "id, number, order_id, order_number, shop_id, status, carrier, tracking_number, tracking_token, warehouse_name, recipient_name, recipient_phone, city, item_count, payment_method, payment_status, grand_total, currency, estimated_delivery, updated_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .in("status", [...statuses]);
    if (shopId) query = query.eq("shop_id", shopId);

    const { data, error, count } = await query
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, from + DELIVERIES_PAGE_SIZE - 1);
    if (error) throw fromPostgrestError(error);

    const total = count ?? 0;
    return {
      total,
      page: Math.max(1, page),
      pageCount: Math.max(1, Math.ceil(total / DELIVERIES_PAGE_SIZE)),
      items: data.map((s): DeliveryRow => ({
        id: s.id,
        number: s.number ?? "",
        orderId: s.order_id,
        orderNumber: s.order_number,
        shopId: s.shop_id,
        status: s.status,
        carrier: s.carrier,
        trackingNumber: s.tracking_number,
        trackingToken: s.tracking_token,
        warehouseName: s.warehouse_name,
        recipientName: s.recipient_name,
        recipientPhone: s.recipient_phone,
        city: s.city,
        itemCount: Number(s.item_count ?? 0),
        codDue: s.payment_method === "cod" && s.payment_status !== "paid" ? s.grand_total : null,
        currency: s.currency,
        estimatedDelivery: s.estimated_delivery,
        updatedAt: s.updated_at,
      })),
    };
  },
);

export const countDeliveries = cache(
  async (
    organizationId: string,
    groups: Record<string, readonly ShipmentStatus[]>,
    shopId: string | null,
  ) => {
    const supabase = await createClient();
    const entries = await Promise.all(
      Object.entries(groups).map(async ([key, statuses]) => {
        let q = supabase
          .from("shipment_overview")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("status", [...statuses]);
        if (shopId) q = q.eq("shop_id", shopId);
        const { count, error } = await q;
        if (error) throw fromPostgrestError(error);
        return [key, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<string, number>;
  },
);

/** A customer's orders, newest first (RLS limits them to shops the viewer can access). */
export const listCustomerOrders = cache(async (organizationId: string, customerId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_overview")
    .select(
      "id, number, shop_name, status, payment_status, payment_method, fulfillment_status, currency, grand_total, placed_at, customer_name, city, item_count",
    )
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("placed_at", { ascending: false })
    .limit(100);
  if (error) throw fromPostgrestError(error);
  return data.map((o): OrderListItem => ({
    id: o.id,
    number: o.number,
    shopName: o.shop_name,
    status: o.status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    fulfillmentStatus: o.fulfillment_status,
    currency: o.currency,
    grandTotal: o.grand_total,
    placedAt: o.placed_at,
    customerName: o.customer_name,
    city: o.city,
    itemCount: Number(o.item_count ?? 0),
  }));
});
