"use server";

import { refresh } from "next/cache";

import {
  addIndustriesSchema,
  createAttributeSchema,
  createCategorySchema,
  deleteAttributeSchema,
  deleteCategorySchema,
  updateAttributeSchema,
  updateCategorySchema,
} from "@/features/catalog/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";

const CATALOG_FORBIDDEN = "Only owners, admins and managers can edit categories.";

/** Add industries to an organization and seed their starter categories. */
export const addIndustries = createAction({
  name: "catalog.addIndustries",
  schema: addIndustriesSchema,
  handler: async ({ organizationSlug, industries }, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      organizationSlug,
      "organization.update",
      "Only owners and admins can add industries.",
    );

    const { error } = await supabase.rpc("add_industries", {
      p_organization_id: org.id,
      p_industries: industries,
    });
    if (error) throw fromPostgrestError(error);

    refresh();
    return { added: industries.length };
  },
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategory = createAction({
  name: "catalog.createCategory",
  schema: createCategorySchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      CATALOG_FORBIDDEN,
    );

    const { data: parent, error: parentError } = await supabase
      .from("categories")
      .select("industry")
      .eq("id", input.parentId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (parentError) throw fromPostgrestError(parentError);
    if (!parent) throw Errors.notFound("Parent category");

    const { data, error } = await supabase
      .from("categories")
      .insert({
        organization_id: org.id,
        parent_id: input.parentId,
        industry: parent.industry,
        name: input.name,
        slug: input.slug,
        tracking: input.tracking,
        hsn_code: input.hsnCode,
        gst_rate: input.gstRate,
      })
      .select("id")
      .single();
    if (error) throw fromPostgrestError(error, { conflictField: "slug" });

    refresh();
    return data;
  },
});

export const updateCategory = createAction({
  name: "catalog.updateCategory",
  schema: updateCategorySchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      CATALOG_FORBIDDEN,
    );

    const { data, error } = await supabase
      .from("categories")
      .update({
        name: input.name,
        slug: input.slug,
        tracking: input.tracking,
        hsn_code: input.hsnCode,
        gst_rate: input.gstRate,
      })
      .eq("id", input.categoryId)
      .eq("organization_id", org.id)
      .select("id")
      .maybeSingle();
    if (error) throw fromPostgrestError(error, { conflictField: "slug" });
    if (!data) throw Errors.notFound("Category");

    refresh();
    return data;
  },
});

export const deleteCategory = createAction({
  name: "catalog.deleteCategory",
  schema: deleteCategorySchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      CATALOG_FORBIDDEN,
    );

    const { data, error } = await supabase
      .from("categories")
      .delete()
      .eq("id", input.categoryId)
      .eq("organization_id", org.id)
      .select("id");
    if (error) throw fromPostgrestError(error);
    if (data.length === 0) throw Errors.notFound("Category");

    refresh();
    return { deleted: true };
  },
});

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const createAttribute = createAction({
  name: "catalog.createAttribute",
  schema: createAttributeSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      CATALOG_FORBIDDEN,
    );

    const { count, error: countError } = await supabase
      .from("attribute_definitions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("category_id", input.categoryId);
    if (countError) throw fromPostgrestError(countError);

    const { data, error } = await supabase
      .from("attribute_definitions")
      .insert({
        organization_id: org.id,
        category_id: input.categoryId,
        key: input.key,
        label: input.label,
        type: input.type,
        options: input.options,
        unit: input.unit,
        is_required: input.isRequired,
        is_variant_option: input.isVariantOption,
        sort_order: (count ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error) throw fromPostgrestError(error, { conflictField: "key" });

    refresh();
    return data;
  },
});

export const updateAttribute = createAction({
  name: "catalog.updateAttribute",
  schema: updateAttributeSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      CATALOG_FORBIDDEN,
    );

    const { data: current, error: readError } = await supabase
      .from("attribute_definitions")
      .select("type, is_variant_option")
      .eq("id", input.attributeId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (readError) throw fromPostgrestError(readError);
    if (!current) throw Errors.notFound("Field");

    const usesOptions = current.type === "select" || current.type === "multiselect";
    if (usesOptions && input.options.length === 0) {
      throw Errors.validation({ options: ["Add at least one option"] });
    }

    const { error } = await supabase
      .from("attribute_definitions")
      .update({
        label: input.label,
        options: usesOptions ? input.options : [],
        unit: input.unit,
        is_required: current.is_variant_option ? false : input.isRequired,
      })
      .eq("id", input.attributeId)
      .eq("organization_id", org.id);
    if (error) throw fromPostgrestError(error);

    refresh();
    return { id: input.attributeId };
  },
});

export const deleteAttribute = createAction({
  name: "catalog.deleteAttribute",
  schema: deleteAttributeSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      CATALOG_FORBIDDEN,
    );

    const { data, error } = await supabase
      .from("attribute_definitions")
      .delete()
      .eq("id", input.attributeId)
      .eq("organization_id", org.id)
      .select("id");
    if (error) throw fromPostgrestError(error);
    if (data.length === 0) throw Errors.notFound("Field");

    refresh();
    return { deleted: true };
  },
});
