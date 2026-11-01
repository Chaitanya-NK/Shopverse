import { z } from "zod";

import { env } from "@/env";
import { PRODUCT_IMAGES_BUCKET } from "@/features/products/images";
import { slugSchema } from "@/features/organizations/schemas";

/** Brand images share the public photo bucket, under <org>/shops/<shop>/<id>. */
export const BRAND_SIZES = {
  logo: { large: 512, small: 192 },
  banner: { large: 1920, small: 960 },
} as const;
export type BrandImageKind = keyof typeof BRAND_SIZES;

export function brandObjectKey(path: string, width: number) {
  return `${path}-${width}.webp`;
}
export function brandImageUrl(path: string, kind: BrandImageKind, size: "large" | "small") {
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${brandObjectKey(path, BRAND_SIZES[kind][size])}`;
}

const imageRef = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/shops\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const bannerSchema = imageRef.extend({
  id: z.uuid(),
  headline: z.string().catch(""),
  subtext: z.string().catch(""),
  link: z.string().catch(""),
  alt: z.string().catch(""),
});
export type Banner = z.output<typeof bannerSchema>;

/** shops.settings -> 'branding' as stored (anything unexpected is dropped). */
export const brandingSchema = z
  .object({
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .nullable()
      .catch(null),
    logo: imageRef.nullable().catch(null),
    banners: z.array(bannerSchema).catch([]),
  })
  .partial()
  .nullable()
  .catch(null)
  .transform((b) => ({
    color: b?.color ?? null,
    logo: b?.logo ?? null,
    banners: b?.banners ?? [],
  }));
export type Branding = z.output<typeof brandingSchema>;

const shopRef = { organizationSlug: slugSchema, shopId: z.uuid() };
export const shopRefSchema = z.object(shopRef);

export const brandColorSchema = z.object({
  ...shopRef,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1d6b5c"),
});
