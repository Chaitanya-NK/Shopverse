"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  collectionFormSchema,
  collectionProductsSchema,
  collectionRefSchema,
  reorderCollectionSchema,
} from "@/features/collections/schemas";
import { searchProductsForCollection } from "@/features/collections/queries";
import { authorizeOrganization } from "@/features/organizations/server";
import { slugSchema } from "@/features/organizations/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const FORBIDDEN = "Only owners, admins and managers can manage collections.";
const authorize = (supabase: ServerSupabaseClient, userId: string, slug: string) =>
  authorizeOrganization(supabase, userId, slug, "catalog.manage", FORBIDDEN);

export const saveCollection = createAction({
  name: "collections.save",
  schema: collectionFormSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    const row = {
      shop_id: input.shopId,
      title: input.title,
      slug: input.slug,
      description: input.description || null,
      featured: input.featured,
      is_active: input.isActive,
    };
    const { data, error } = input.collectionId
      ? await supabase
          .from("collections")
          .update(row)
          .eq("id", input.collectionId)
          .eq("organization_id", org.id)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("collections")
          .insert({ ...row, organization_id: org.id })
          .select("id")
          .single();
    if (error) {
      if (error.code === "23505")
        throw Errors.conflict("This shop already has a collection with that link.", {
          slug: ["Already used in this shop. Try another."],
        });
      throw fromPostgrestError(error);
    }
    if (!data) throw Errors.notFound("Collection");
    refresh();
    return { collectionId: data.id };
  },
});

export const deleteCollection = createAction({
  name: "collections.delete",
  schema: collectionRefSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    const { error } = await supabase
      .from("collections")
      .delete()
      .eq("id", input.collectionId)
      .eq("organization_id", org.id);
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const addCollectionProducts = createAction({
  name: "collections.addProducts",
  schema: collectionProductsSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    const { data: last } = await supabase
      .from("collection_products")
      .select("position")
      .eq("collection_id", input.collectionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const start = (last?.position ?? 0) + 1;
    const { error } = await supabase.from("collection_products").upsert(
      input.productIds.map((productId, i) => ({
        organization_id: org.id,
        collection_id: input.collectionId,
        product_id: productId,
        position: start + i,
      })),
      { onConflict: "collection_id,product_id", ignoreDuplicates: true },
    );
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const removeCollectionProducts = createAction({
  name: "collections.removeProducts",
  schema: collectionProductsSchema,
  handler: async (input, { supabase, user }) => {
    await authorize(supabase, user.id, input.organizationSlug);
    const { error } = await supabase
      .from("collection_products")
      .delete()
      .eq("collection_id", input.collectionId)
      .in("product_id", input.productIds);
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const reorderCollection = createAction({
  name: "collections.reorder",
  schema: reorderCollectionSchema,
  handler: async (input, { supabase, user }) => {
    await authorize(supabase, user.id, input.organizationSlug);
    const { error } = await supabase.rpc("reorder_collection", {
      p_collection_id: input.collectionId,
      p_product_ids: input.productIds,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const findProductsForCollection = createAction({
  name: "collections.findProducts",
  schema: z.object({
    organizationSlug: slugSchema,
    exclude: z.array(z.uuid()).max(500),
    search: z.string().max(100),
  }),
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    return searchProductsForCollection(org.id, input.exclude, input.search);
  },
});
