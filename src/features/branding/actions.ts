"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  BRAND_SIZES,
  type BrandImageKind,
  brandColorSchema,
  brandObjectKey,
  type Branding,
  brandingSchema,
  shopRefSchema,
} from "@/features/branding/schemas";
import { DEFAULT_BRAND_COLOR } from "@/features/branding/theme";
import { slugSchema } from "@/features/organizations/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  PRODUCT_IMAGES_BUCKET,
} from "@/features/products/images";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { toWebp } from "@/lib/images/process";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ServerSupabaseClient } from "@/lib/supabase/server";
import { type Json } from "@/types/database.types";

const FORBIDDEN = "Only owners and admins can change the shop's brand.";

async function loadShop(
  supabase: ServerSupabaseClient,
  userId: string,
  organizationSlug: string,
  shopId: string,
) {
  const org = await authorizeOrganization(
    supabase,
    userId,
    organizationSlug,
    "shops.update",
    FORBIDDEN,
  );
  const { data, error } = await supabase
    .from("shops")
    .select("id, settings")
    .eq("id", shopId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw Errors.notFound("Shop");
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  return {
    organizationId: org.id,
    shopId: data.id,
    branding: brandingSchema.parse(settings.branding),
  };
}

async function save(supabase: ServerSupabaseClient, shopId: string, branding: Branding) {
  const { error } = await supabase.rpc("save_shop_branding", {
    p_shop_id: shopId,
    p_branding: {
      color: branding.color ?? DEFAULT_BRAND_COLOR,
      logo: branding.logo,
      banners: branding.banners,
    } as unknown as Json,
  });
  if (error) throw fromPostgrestError(error);
  refresh();
}

function removeFiles(kind: BrandImageKind, path: string) {
  const sizes = BRAND_SIZES[kind];
  return createAdminClient()
    .storage.from(PRODUCT_IMAGES_BUCKET)
    .remove([brandObjectKey(path, sizes.large), brandObjectKey(path, sizes.small)])
    .then(({ error }) => {
      if (error) logger.warn({ err: error, path }, "Removing brand image failed");
    });
}

export const saveBrandColor = createAction({
  name: "branding.color",
  schema: brandColorSchema,
  handler: async (input, { supabase, user }) => {
    const shop = await loadShop(supabase, user.id, input.organizationSlug, input.shopId);
    await save(supabase, shop.shopId, { ...shop.branding, color: input.color.toLowerCase() });
    return null;
  },
});

const uploadSchema = z.object({
  organizationSlug: slugSchema,
  shopId: z.uuid(),
  kind: z.enum(["logo"]),
  file: z
    .instanceof(File, { message: "Choose an image" })
    .refine((f) => f.size > 0, "This file is empty")
    .refine((f) => f.size <= MAX_UPLOAD_BYTES, "Images can be up to 8 MB")
    .refine(
      (f) => (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(f.type),
      "Use a JPG, PNG or WebP image",
    ),
});

/** Upload the logo, replacing the old one. (Banners are sections in the shop's design now.) */
export const uploadBrandImage = createAction({
  name: "branding.upload",
  schema: uploadSchema,
  handler: async (input, { supabase, user }) => {
    const shop = await loadShop(supabase, user.id, input.organizationSlug, input.shopId);

    const sizes = BRAND_SIZES[input.kind];
    const source = Buffer.from(await input.file.arrayBuffer());
    const [large, small] = await Promise.all([
      toWebp(source, sizes.large, 85),
      toWebp(source, sizes.small, 80),
    ]);

    const id = crypto.randomUUID();
    const path = `${shop.organizationId}/shops/${shop.shopId}/${id}`;
    const bucket = createAdminClient().storage.from(PRODUCT_IMAGES_BUCKET);
    for (const [width, image] of [
      [sizes.large, large],
      [sizes.small, small],
    ] as const) {
      const { error } = await bucket.upload(brandObjectKey(path, width), image.data, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) {
        logger.error({ err: error, path }, "Brand image upload failed");
        await removeFiles(input.kind, path);
        throw new Error("Storage upload failed", { cause: error });
      }
    }

    const image = { path, width: large.width, height: large.height };
    const next: Branding = { ...shop.branding, logo: image };
    try {
      await save(supabase, shop.shopId, next);
    } catch (cause) {
      await removeFiles(input.kind, path);
      throw cause;
    }
    if (shop.branding.logo) await removeFiles("logo", shop.branding.logo.path);
    return { path };
  },
});

export const removeLogo = createAction({
  name: "branding.removeLogo",
  schema: shopRefSchema,
  handler: async (input, { supabase, user }) => {
    const shop = await loadShop(supabase, user.id, input.organizationSlug, input.shopId);
    if (!shop.branding.logo) return null;
    await save(supabase, shop.shopId, { ...shop.branding, logo: null });
    await removeFiles("logo", shop.branding.logo.path);
    return null;
  },
});
