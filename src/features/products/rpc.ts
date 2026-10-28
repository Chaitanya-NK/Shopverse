import { type z } from "zod";

import { type updateProductSchema } from "@/features/products/schemas";
import { type Json } from "@/types/database.types";

/** Validated product fields -> the jsonb that create_product / update_product take. */
export type ParsedProduct = Omit<z.output<typeof updateProductSchema>, "productId">;
type JsonObject = { [key: string]: Json };

export function toProductJson(product: ParsedProduct): JsonObject {
  return {
    title: product.title,
    slug: product.slug,
    description: product.description,
    status: product.status,
    attributes: product.attributes as Json,
    tags: product.tags,
    hsn_code: product.hsnCode,
    gst_rate: product.gstRate,
  };
}

export function toVariantJson(variant: ParsedProduct["variants"][number]): JsonObject {
  return {
    id: variant.id ?? null,
    sku: variant.sku,
    title: variant.title,
    options: variant.options,
    price: variant.price,
    compare_at_price: variant.compareAtPrice,
    cost_price: variant.costPrice,
    barcode: variant.barcode,
  };
}
