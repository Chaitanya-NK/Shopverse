"use server";

import { resolveTxt } from "node:dns/promises";

import { refresh } from "next/cache";

import { domainRefSchema, setDomainSchema, verificationHost } from "@/features/domains/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const FORBIDDEN = "Only owners and admins can change the shop's domain.";

async function authorize(supabase: ServerSupabaseClient, userId: string, slug: string) {
  return authorizeOrganization(supabase, userId, slug, "shops.update", FORBIDDEN);
}

export const setShopDomain = createAction({
  name: "domains.set",
  schema: setDomainSchema,
  handler: async (input, { supabase, user }) => {
    await authorize(supabase, user.id, input.organizationSlug);
    const { data, error } = await supabase.rpc("set_shop_domain", {
      p_shop_id: input.shopId,
      p_domain: input.domain,
    });
    if (error) {
      if (error.code === "23505")
        throw Errors.conflict("Another shop already uses this domain.", {
          domain: ["Another shop already uses this domain."],
        });
      throw fromPostgrestError(error, { conflictField: "domain" });
    }
    refresh();
    return { token: data };
  },
});

export const removeShopDomain = createAction({
  name: "domains.remove",
  schema: domainRefSchema,
  handler: async (input, { supabase, user }) => {
    await authorize(supabase, user.id, input.organizationSlug);
    const { error } = await supabase.rpc("remove_shop_domain", { p_shop_id: input.shopId });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

/** Look for the TXT record; if it's there, the shop is served on the domain. */
export const verifyShopDomain = createAction({
  name: "domains.verify",
  schema: domainRefSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, custom_domain, domain_token, domain_verified_at")
      .eq("id", input.shopId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!shop?.custom_domain || !shop.domain_token) throw Errors.notFound("Domain");
    if (shop.domain_verified_at) return { verified: true, found: [] as string[] };

    let found: string[] = [];
    try {
      found = (await resolveTxt(verificationHost(shop.custom_domain))).map((chunks) =>
        chunks.join(""),
      );
    } catch (cause) {
      // ENOTFOUND / ENODATA: the record isn't there (yet).
      logger.info({ err: cause, domain: shop.custom_domain }, "Domain TXT lookup found nothing");
    }
    if (!found.includes(shop.domain_token)) return { verified: false, found };

    const { error: markError } = await createAdminClient().rpc("mark_shop_domain_verified", {
      p_shop_id: shop.id,
      p_domain: shop.custom_domain,
    });
    if (markError) throw fromPostgrestError(markError);
    refresh();
    return { verified: true, found };
  },
});
