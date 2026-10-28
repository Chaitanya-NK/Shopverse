"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { discountFormSchema, endOfDayIst, startOfDayIst } from "@/features/discounts/schemas";
import { slugSchema } from "@/features/organizations/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";

const FORBIDDEN = "Only owners, admins and managers can manage discounts.";

export const saveDiscount = createAction({
  name: "discounts.save",
  schema: discountFormSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      FORBIDDEN,
    );
    const row = {
      code: input.type === "code" ? input.code : null,
      title: input.title,
      kind: input.kind,
      value: input.kind === "free_shipping" ? 0 : input.value!,
      max_discount: input.kind === "percent" ? input.maxDiscount : null,
      min_subtotal: input.minSubtotal,
      ends_at: input.endsOn ? endOfDayIst(input.endsOn) : null,
      usage_limit: input.usageLimit,
      per_customer_limit: input.perCustomerLimit,
      first_order_only: input.firstOrderOnly,
      shop_ids: input.allShops ? null : input.shopIds,
      is_active: input.isActive,
      ...(input.startsOn ? { starts_at: startOfDayIst(input.startsOn) } : {}),
    };

    const query = input.discountId
      ? supabase
          .from("discounts")
          .update(row)
          .eq("id", input.discountId)
          .eq("organization_id", org.id)
          .select("id")
          .maybeSingle()
      : supabase
          .from("discounts")
          .insert({ ...row, organization_id: org.id })
          .select("id")
          .single();
    const { data, error } = await query;
    if (error) {
      if (error.code === "23505")
        throw Errors.conflict("That code is already used by another discount.", {
          code: ["That code is already used by another discount"],
        });
      throw fromPostgrestError(error);
    }
    if (!data) throw Errors.notFound("Discount");
    refresh();
    return { id: data.id };
  },
});

const refSchema = z.object({ organizationSlug: slugSchema, discountId: z.uuid() });

export const setDiscountActive = createAction({
  name: "discounts.setActive",
  schema: refSchema.extend({ active: z.boolean() }),
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      FORBIDDEN,
    );
    const { error } = await supabase
      .from("discounts")
      .update({ is_active: input.active })
      .eq("id", input.discountId)
      .eq("organization_id", org.id);
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const deleteDiscount = createAction({
  name: "discounts.delete",
  schema: refSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "catalog.manage",
      FORBIDDEN,
    );
    const { error } = await supabase
      .from("discounts")
      .delete()
      .eq("id", input.discountId)
      .eq("organization_id", org.id);
    if (error) {
      if (error.code === "23503")
        throw Errors.conflict(
          "Orders have used this discount, so it can't be deleted. Switch it off instead.",
        );
      throw fromPostgrestError(error);
    }
    refresh();
    return null;
  },
});
