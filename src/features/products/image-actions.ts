"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_SIZES,
  imageObjectKey,
  MAX_PRODUCT_IMAGES,
  MAX_UPLOAD_BYTES,
  PRODUCT_IMAGES_BUCKET,
} from "@/features/products/images";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { toWebp } from "@/lib/images/process";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const FORBIDDEN = "Only owners, admins and managers can change product photos.";
const altSchema = z.string().trim().max(200, "Keep it under 200 characters").optional().default("");

async function requireProduct(
  supabase: ServerSupabaseClient,
  userId: string,
  organizationSlug: string,
  productId: string,
) {
  const org = await authorizeOrganization(
    supabase,
    userId,
    organizationSlug,
    "catalog.manage",
    FORBIDDEN,
  );
  const { data, error } = await supabase
    .from("products")
    .select("id, organization_id")
    .eq("id", productId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw Errors.notFound("Product");
  return { organizationId: org.id, productId: data.id };
}

const uploadSchema = z.object({
  organizationSlug: slugSchema,
  productId: z.uuid(),
  alt: altSchema,
  file: z
    .instanceof(File, { message: "Choose a photo" })
    .refine((f) => f.size > 0, "This file is empty")
    .refine((f) => f.size <= MAX_UPLOAD_BYTES, "Photos can be up to 8 MB")
    .refine(
      (f) => (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(f.type),
      "Use a JPG, PNG or WebP photo",
    ),
});

/**
 * Upload one photo: re-encode to WebP in two sizes, store both in the public
 * bucket under <org>/<product>/<id>, then record it (RLS checks the role).
 */
export const uploadProductImage = createAction({
  name: "products.uploadImage",
  schema: uploadSchema,
  handler: async (input, { supabase, user }) => {
    const { organizationId, productId } = await requireProduct(
      supabase,
      user.id,
      input.organizationSlug,
      input.productId,
    );

    const { count, error: countError } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if (countError) throw fromPostgrestError(countError);
    if ((count ?? 0) >= MAX_PRODUCT_IMAGES)
      throw Errors.validation({ file: [`A product can have up to ${MAX_PRODUCT_IMAGES} photos`] });

    const source = Buffer.from(await input.file.arrayBuffer());
    const [large, thumb] = await Promise.all([
      toWebp(source, IMAGE_SIZES.large),
      toWebp(source, IMAGE_SIZES.thumb, 78),
    ]);

    const id = crypto.randomUUID();
    const path = `${organizationId}/${productId}/${id}`;
    const keys = [imageObjectKey(path, "large"), imageObjectKey(path, "thumb")];
    const bucket = createAdminClient().storage.from(PRODUCT_IMAGES_BUCKET);

    for (const [key, image] of [
      [keys[0]!, large],
      [keys[1]!, thumb],
    ] as const) {
      const { error } = await bucket.upload(key, image.data, {
        contentType: "image/webp",
        // Paths are unique per photo, so the files never change.
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) {
        logger.error({ err: error, key }, "Product image upload failed");
        await bucket.remove(keys);
        throw new Error("Storage upload failed", { cause: error });
      }
    }

    const { error } = await supabase.from("product_images").insert({
      id,
      organization_id: organizationId,
      product_id: productId,
      alt: input.alt || null,
      width: large.width,
      height: large.height,
    });
    if (error) {
      await bucket.remove(keys);
      throw fromPostgrestError(error);
    }

    refresh();
    return { id, path, width: large.width, height: large.height, alt: input.alt || null };
  },
});

const imageRefSchema = z.object({
  organizationSlug: slugSchema,
  productId: z.uuid(),
  imageId: z.uuid(),
});

export const deleteProductImage = createAction({
  name: "products.deleteImage",
  schema: imageRefSchema,
  handler: async (input, { supabase, user }) => {
    const { organizationId, productId } = await requireProduct(
      supabase,
      user.id,
      input.organizationSlug,
      input.productId,
    );
    const { data, error } = await supabase
      .from("product_images")
      .delete()
      .eq("id", input.imageId)
      .eq("product_id", productId)
      .select("id");
    if (error) throw fromPostgrestError(error);
    if (!data?.length) throw Errors.notFound("Photo");

    const path = `${organizationId}/${productId}/${input.imageId}`;
    const { error: removeError } = await createAdminClient()
      .storage.from(PRODUCT_IMAGES_BUCKET)
      .remove([imageObjectKey(path, "large"), imageObjectKey(path, "thumb")]);
    // The photo is gone from the shop either way; a leftover file is only logged.
    if (removeError)
      logger.warn({ err: removeError, path }, "Could not remove product image files");

    refresh();
    return null;
  },
});

export const reorderProductImages = createAction({
  name: "products.reorderImages",
  schema: z.object({
    organizationSlug: slugSchema,
    productId: z.uuid(),
    imageIds: z.array(z.uuid()).min(1).max(MAX_PRODUCT_IMAGES),
  }),
  handler: async (input, { supabase, user }) => {
    const { productId } = await requireProduct(
      supabase,
      user.id,
      input.organizationSlug,
      input.productId,
    );
    const { error } = await supabase.rpc("reorder_product_images", {
      p_product_id: productId,
      p_image_ids: input.imageIds,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const setProductImageVariant = createAction({
  name: "products.setImageVariant",
  schema: imageRefSchema.extend({ variantId: z.uuid().nullable() }),
  handler: async (input, { supabase, user }) => {
    const { productId } = await requireProduct(
      supabase,
      user.id,
      input.organizationSlug,
      input.productId,
    );
    const { error } = await supabase
      .from("product_images")
      .update({ variant_id: input.variantId })
      .eq("id", input.imageId)
      .eq("product_id", productId);
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const updateProductImageAlt = createAction({
  name: "products.updateImageAlt",
  schema: imageRefSchema.extend({ alt: altSchema }),
  handler: async (input, { supabase, user }) => {
    const { productId } = await requireProduct(
      supabase,
      user.id,
      input.organizationSlug,
      input.productId,
    );
    const { error } = await supabase
      .from("product_images")
      .update({ alt: input.alt || null })
      .eq("id", input.imageId)
      .eq("product_id", productId);
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});
