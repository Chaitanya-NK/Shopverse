import { z } from "zod";

import { env } from "@/env";

/** Public Storage bucket for product photos (see migration 015). */
export const PRODUCT_IMAGES_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGES = 12;
/** What we accept from people; everything is re-encoded to WebP on the server. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Stored sizes (longest side, px). */
export const IMAGE_SIZES = { large: 1600, thumb: 480 } as const;
export type ImageSize = keyof typeof IMAGE_SIZES;

/** "<org>/<product>/<image>" + size -> the object key in the bucket. */
export function imageObjectKey(path: string, size: ImageSize) {
  return `${path}-${IMAGE_SIZES[size]}.webp`;
}

export function productImageUrl(path: string, size: ImageSize) {
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${imageObjectKey(path, size)}`;
}

export const productImageObjectSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  alt: z.string().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ProductImage = z.output<typeof productImageObjectSchema>;

/** A cover photo from the database: an image or nothing. */
export const productImageSchema = productImageObjectSchema
  .nullable()
  .optional()
  .transform((v) => v ?? null);
