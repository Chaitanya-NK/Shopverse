import "server-only";

import { cache } from "react";

import { buildCategoryTree, type CategoryNode } from "@/features/catalog/tree";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** The organization's category tree with each category's attribute definitions. */
export const listCategoryTree = cache(async (organizationId: string): Promise<CategoryNode[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select(
      `id, parent_id, name, slug, industry, tracking, hsn_code, gst_rate, returnable, sort_order,
       attribute_definitions (id, key, label, type, options, unit, is_required, is_variant_option, sort_order),
       products (count)`,
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) throw fromPostgrestError(error);

  return buildCategoryTree(
    data.map((c) => ({
      id: c.id,
      parentId: c.parent_id,
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      tracking: c.tracking,
      hsnCode: c.hsn_code,
      gstRate: c.gst_rate,
      returnable: c.returnable,
      sortOrder: c.sort_order,
      productCount: c.products[0]?.count ?? 0,
      attributes: c.attribute_definitions.map((a) => ({
        id: a.id,
        key: a.key,
        label: a.label,
        type: a.type,
        options: a.options,
        unit: a.unit,
        isRequired: a.is_required,
        isVariantOption: a.is_variant_option,
        sortOrder: a.sort_order,
      })),
    })),
  );
});
