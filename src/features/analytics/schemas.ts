import { z } from "zod";

const num = z.coerce.number();

const slice = <T extends z.ZodRawShape>(shape: T) =>
  z.array(z.object({ ...shape, orders: num, revenue: num }));

/** Shape returned by public.sales_report (jsonb). */
export const salesReportSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    previous_from: z.string(),
    previous_to: z.string(),
    totals: z.object({
      orders: num,
      revenue: num,
      gross: num,
      discounts: num,
      shipping: num,
      tax: num,
      items: num,
      customers: num,
      new_customers: num,
      online_orders: num,
      cod_orders: num,
      cancelled: num,
      returned: num,
      delivered: num,
    }),
    previous: z.object({ orders: num, revenue: num, items: num, customers: num }),
    by_day: z.array(z.object({ day: z.string(), revenue: num, orders: num })),
    top_products: z.array(
      z.object({ key: z.string(), title: z.string().nullable(), quantity: num, revenue: num }),
    ),
    by_payment: slice({ method: z.string() }),
    by_state: slice({ state: z.string() }),
    by_shop: slice({ shop: z.string() }),
  })
  .transform((r) => ({
    from: r.from,
    to: r.to,
    previousFrom: r.previous_from,
    previousTo: r.previous_to,
    totals: {
      ...r.totals,
      newCustomers: r.totals.new_customers,
      onlineOrders: r.totals.online_orders,
      codOrders: r.totals.cod_orders,
    },
    previous: r.previous,
    byDay: r.by_day.map((d) => ({ day: d.day.slice(0, 10), revenue: d.revenue, orders: d.orders })),
    topProducts: r.top_products.map((p) => ({
      key: p.key,
      title: p.title ?? p.key,
      quantity: p.quantity,
      revenue: p.revenue,
    })),
    byPayment: r.by_payment,
    byState: r.by_state,
    byShop: r.by_shop,
  }));
export type SalesReport = z.output<typeof salesReportSchema>;

/** Change against the previous period, as a fraction; null when there's nothing to compare. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function averageOrderValue(revenue: number, orders: number): number {
  return orders === 0 ? 0 : Math.round((revenue / orders) * 100) / 100;
}
