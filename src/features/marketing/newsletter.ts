"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { getStorefrontShop } from "@/features/storefront/queries";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";

const subscribeSchema = z.object({
  shopSlug: z.string().regex(/^[a-z0-9-]{3,48}$/),
  email: z.email("Enter a valid email address").max(254),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});

/** A shopper joins a shop's newsletter. Always answers the same way. */
export const subscribeNewsletter = createAction({
  name: "newsletter.subscribe",
  schema: subscribeSchema,
  requireAuth: false,
  handler: async (input, { supabase }) => {
    if (input.website) return null;
    const shop = await getStorefrontShop(input.shopSlug);
    if (!shop || !shop.live) throw Errors.notFound("Shop");
    const { error } = await supabase.rpc("newsletter_subscribe", {
      p_shop_id: shop.id,
      p_email: input.email,
    });
    if (error) throw fromPostgrestError(error);
    return null;
  },
});

export const removeNewsletterSubscriber = createAction({
  name: "newsletter.remove",
  schema: z.object({ organizationSlug: slugSchema, id: z.uuid() }),
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "marketing.manage",
      "Only owners, admins and managers can change the newsletter list.",
    );
    const { error } = await supabase.rpc("remove_newsletter_subscriber", { p_id: input.id });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});
