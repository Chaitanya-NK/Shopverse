"use server";

import { z } from "zod";

import { LABEL_SELECT, type LabelVariant, toLabelVariant } from "@/features/labels/shared";
import { slugSchema } from "@/features/organizations/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { fromPostgrestError } from "@/lib/errors";
import { containsPattern } from "@/lib/postgrest";

/** Products to print labels for (anyone who handles stock). */
export const searchLabelVariants = createAction({
  name: "labels.search",
  schema: z.object({ organizationSlug: slugSchema, query: z.string().trim().max(100) }),
  handler: async (input, { supabase, user }): Promise<LabelVariant[]> => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      "You can't print labels in this business.",
    );
    let search = supabase
      .from("variant_search")
      .select("id")
      .eq("organization_id", org.id)
      .neq("product_status", "archived");
    if (input.query)
      search = search.ilike("search_text", containsPattern(input.query.toLowerCase()));
    const { data: ids, error } = await search.order("product_title").order("sku").limit(20);
    if (error) throw fromPostgrestError(error);
    if (ids.length === 0) return [];
    const { data, error: variantError } = await supabase
      .from("product_variants")
      .select(LABEL_SELECT)
      .in(
        "id",
        ids.map((v) => v.id),
      );
    if (variantError) throw fromPostgrestError(variantError);
    const order = new Map(ids.map((v, i) => [v.id, i]));
    return data.map(toLabelVariant).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  },
});
