"use server";

import { z } from "zod";

import { BRAND_SIZES, brandObjectKey } from "@/features/branding/schemas";
import { defaultDesign } from "@/features/design/presets";
import { designProblems, parseDesign } from "@/features/design/schema";
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

const FORBIDDEN = "Only owners, admins and shop managers can change the shop's design.";

const shopRef = { organizationSlug: slugSchema, shopId: z.uuid() };

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
    "storefront.design",
    FORBIDDEN,
  );
  const { data, error } = await supabase
    .from("shops")
    .select("id, name")
    .eq("id", shopId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw Errors.notFound("Shop");
  return { organizationId: org.id, shopId: data.id, name: data.name };
}

const EMPTY_CONTEXT = {
  name: "",
  tagline: null,
  deliveryNote: "",
  banners: [],
  collections: [],
  categories: [],
};

const saveSchema = z.object({
  ...shopRef,
  version: z.number().int().min(0),
  design: z.record(z.string(), z.unknown()),
});

/** Autosave of the editor's draft. Returns the new version. */
export const saveDesignDraft = createAction({
  name: "design.saveDraft",
  schema: saveSchema,
  handler: async (input, { supabase, user }) => {
    const shop = await loadShop(supabase, user.id, input.organizationSlug, input.shopId);
    // Re-read through the same parser shoppers' pages use: only known
    // sections and settings are stored.
    const design = parseDesign(input.design, defaultDesign(EMPTY_CONTEXT));
    const problems = designProblems(design);
    if (problems.length > 0) throw Errors.validation({ design: problems }, problems[0]);
    const { data, error } = await supabase.rpc("save_design_draft", {
      p_shop_id: shop.shopId,
      p_design: design as unknown as Json,
      p_version: input.version,
    });
    if (error) throw fromPostgrestError(error);
    return { version: data };
  },
});

const versionSchema = z.object({ ...shopRef, version: z.number().int().min(0) });

export const publishDesign = createAction({
  name: "design.publish",
  schema: versionSchema,
  handler: async (input, { supabase, user }) => {
    const shop = await loadShop(supabase, user.id, input.organizationSlug, input.shopId);
    const { data, error } = await supabase.rpc("publish_design", {
      p_shop_id: shop.shopId,
      p_version: input.version,
    });
    if (error) throw fromPostgrestError(error);
    return { version: data };
  },
});

export const discardDesignDraft = createAction({
  name: "design.discard",
  schema: versionSchema,
  handler: async (input, { supabase, user }) => {
    const shop = await loadShop(supabase, user.id, input.organizationSlug, input.shopId);
    const { data, error } = await supabase.rpc("discard_design_draft", {
      p_shop_id: shop.shopId,
      p_version: input.version,
    });
    if (error) throw fromPostgrestError(error);
    return { version: data };
  },
});

const uploadSchema = z.object({
  ...shopRef,
  file: z
    .instanceof(File, { message: "Choose an image" })
    .refine((f) => f.size > 0, "This file is empty")
    .refine((f) => f.size <= MAX_UPLOAD_BYTES, "Images can be up to 8 MB")
    .refine(
      (f) => (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(f.type),
      "Use a JPG, PNG or WebP image",
    ),
});

/**
 * An image for a section (slides, galleries, tiles…), stored as WebP in two
 * widths next to the shop's logo. The design refers to it by path.
 */
export const uploadDesignImage = createAction({
  name: "design.upload",
  schema: uploadSchema,
  handler: async (input, { supabase, user }) => {
    const shop = await loadShop(supabase, user.id, input.organizationSlug, input.shopId);
    const sizes = BRAND_SIZES.banner;
    const source = Buffer.from(await input.file.arrayBuffer());
    const [large, small] = await Promise.all([
      toWebp(source, sizes.large, 85),
      toWebp(source, sizes.small, 80),
    ]);
    const path = `${shop.organizationId}/shops/${shop.shopId}/${crypto.randomUUID()}`;
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
        logger.error({ err: error, path }, "Design image upload failed");
        await bucket.remove([brandObjectKey(path, sizes.large), brandObjectKey(path, sizes.small)]);
        throw new Error("Storage upload failed", { cause: error });
      }
    }
    return { path, width: large.width, height: large.height };
  },
});
