"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { routes } from "@/config/routes";
import { createOrganizationSchema } from "@/features/organizations/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { slugify, toWarehouseCode } from "@/lib/slug";

const rpcResultSchema = z.object({
  organization_id: z.uuid(),
  organization_slug: z.string(),
  shop_id: z.uuid(),
});

/**
 * Onboarding: creates the organization, owner membership, first shop and
 * first warehouse in one database transaction (public.create_organization).
 */
export const createOrganization = createAction({
  name: "organizations.create",
  schema: createOrganizationSchema,
  handler: async (input, { supabase, user }) => {
    const { data, error } = await supabase.rpc("create_organization", {
      p_name: input.organizationName,
      p_slug: input.organizationSlug,
      p_shop_name: input.shopName,
      p_shop_slug: slugify(input.shopName) || "main",
      p_currency: input.currency,
      p_warehouse_name: input.warehouseName,
      p_warehouse_code: toWarehouseCode(input.warehouseCity),
      p_warehouse_city: input.warehouseCity,
      p_industries: input.industries,
    });

    if (error) {
      throw fromPostgrestError(error, { conflictField: "organizationSlug" });
    }

    const result = rpcResultSchema.safeParse(data);
    if (!result.success) throw Errors.internal(result.error);

    logger.info(
      { userId: user.id, organizationId: result.data.organization_id },
      "Organization created",
    );
    redirect(routes.org(result.data.organization_slug));
  },
});
