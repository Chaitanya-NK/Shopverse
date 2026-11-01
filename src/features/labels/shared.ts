/** A variant as printed on a barcode label. */
export type LabelVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  title: string;
  productTitle: string;
  price: number;
};

export const LABEL_SELECT = "id, sku, barcode, title, price, product:products (title)" as const;

export function toLabelVariant(v: {
  id: string;
  sku: string;
  barcode: string | null;
  title: string;
  price: number;
  product: { title: string } | null;
}): LabelVariant {
  return {
    id: v.id,
    sku: v.sku,
    barcode: v.barcode,
    title: v.title,
    productTitle: v.product?.title ?? "",
    price: Number(v.price),
  };
}

/** "?v=<id>:<qty>,<id>:<qty>" (from a received purchase order) -> quantities by id. */
export function parseLabelParam(value: string | string[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  for (const part of raw.split(",").slice(0, 200)) {
    const [id, qty] = part.split(":");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      const n = Math.min(Math.max(Number.parseInt(qty ?? "1", 10) || 1, 1), 500);
      out.set(id, n);
    }
  }
  return out;
}
