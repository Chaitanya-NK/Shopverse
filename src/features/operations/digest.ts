import { z } from "zod";

const lowStockItem = z.object({
  product_title: z.string(),
  variant_title: z.string(),
  sku: z.string(),
  warehouse_name: z.string(),
  available: z.coerce.number(),
  reorder_point: z.coerce.number(),
});

/** What private.digest_data returns. */
export const digestSchema = z.object({
  day: z.string(),
  sales: z.object({ orders: z.coerce.number(), total: z.coerce.number() }),
  to_confirm: z.coerce.number(),
  to_pack: z.coerce.number(),
  out_for_delivery: z.coerce.number(),
  failed_attempts: z.coerce.number(),
  returns_to_review: z.coerce.number(),
  low_stock: z.object({ count: z.coerce.number(), items: z.array(lowStockItem) }),
  purchase_orders: z.object({ due_today: z.coerce.number(), overdue: z.coerce.number() }),
});
export type Digest = z.output<typeof digestSchema>;
export type LowStockItem = z.output<typeof lowStockItem>;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Things that need someone today, in the order they're shown. */
export function digestTasks(d: Digest): { label: string; count: number }[] {
  const tasks: [number, string, string][] = [
    [d.to_confirm, "order to confirm", "orders to confirm"],
    [d.to_pack, "order to pack", "orders to pack"],
    [d.out_for_delivery, "parcel out for delivery", "parcels out for delivery"],
    [d.failed_attempts, "missed delivery to sort out", "missed deliveries to sort out"],
    [d.returns_to_review, "return request to review", "return requests to review"],
    [
      d.purchase_orders.due_today,
      "purchase order arriving today",
      "purchase orders arriving today",
    ],
    [d.purchase_orders.overdue, "purchase order overdue", "purchase orders overdue"],
    [d.low_stock.count, "item low on stock", "items low on stock"],
  ];
  return tasks
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => ({ count, label: plural(count, one, many) }));
}
