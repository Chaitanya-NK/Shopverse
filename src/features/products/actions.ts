"use server";

import { refresh } from "next/cache";
import { type z } from "zod";

import { authorizeOrganization } from "@/features/organizations/server";
import { type AttributeDefinition } from "@/features/products/attribute-values";
import {
  createProductSchema,
  updateProductSchema,
  withCategoryRules,
} from "@/features/products/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";
import { toProductJson, toVariantJson } from "@/features/products/rpc";

const FORBIDDEN = "Only owners, admins and managers can edit products.";

export const createProduct = createAction({
  name: "products.create",
  schema: createProductSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      FORBIDDEN,
    );
    const defs = await loadCategoryFields(supabase, org.id, input.categoryId);
    const product = parseWithCategory(createProductSchema, defs, input);

    const { data: productId, error } = await supabase.rpc("create_product", {
      p_organization_id: org.id,
      p_product: { ...toProductJson(product), category_id: input.categoryId },
      p_variants: product.variants.map(toVariantJson),
      p_shop_ids: product.shopIds,
    });
    if (error) throw fromPostgrestError(error, { conflictField: "slug" });

    refresh();
    return { id: productId };
  },
});

export const updateProduct = createAction({
  name: "products.update",
  schema: updateProductSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      FORBIDDEN,
    );

    const { data: existing, error: readError } = await supabase
      .from("products")
      .select("category_id")
      .eq("id", input.productId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (readError) throw fromPostgrestError(readError);
    if (!existing) throw Errors.notFound("Product");

    const defs = existing.category_id
      ? await loadCategoryFields(supabase, org.id, existing.category_id)
      : [];
    const product = parseWithCategory(updateProductSchema, defs, input);

    const { error } = await supabase.rpc("update_product", {
      p_product_id: input.productId,
      p_product: toProductJson(product),
      p_variants: product.variants.map(toVariantJson),
      p_shop_ids: product.shopIds,
    });
    if (error) throw fromPostgrestError(error, { conflictField: "slug" });

    refresh();
    return { id: input.productId };
  },
});

// ---------------------------------------------------------------------------

async function loadCategoryFields(
  supabase: ServerSupabaseClient,
  organizationId: string,
  categoryId: string,
): Promise<AttributeDefinition[]> {
  const { data, error } = await supabase
    .from("categories")
    .select(
      "id, attribute_definitions (key, label, type, options, unit, is_required, is_variant_option)",
    )
    .eq("organization_id", organizationId)
    .eq("id", categoryId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw Errors.validation({ categoryId: ["Choose a category"] });

  return data.attribute_definitions.map((a) => ({
    key: a.key,
    label: a.label,
    type: a.type,
    options: a.options,
    unit: a.unit,
    isRequired: a.is_required,
    isVariantOption: a.is_variant_option,
  }));
}

/** Re-validate with the category's rules; field errors come back keyed like the form. */
function parseWithCategory<T extends typeof createProductSchema | typeof updateProductSchema>(
  schema: T,
  defs: AttributeDefinition[],
  input: unknown,
): z.output<T> {
  const parsed = withCategoryRules(schema, defs).safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (fieldErrors[issue.path.join(".") || "_form"] ??= []).push(issue.message);
    }
    throw Errors.validation(fieldErrors);
  }
  return parsed.data as z.output<T>;
}
