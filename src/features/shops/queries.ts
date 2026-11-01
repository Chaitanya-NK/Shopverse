import "server-only";

import { cache } from "react";

import { type Branding, brandingSchema } from "@/features/branding/schemas";
import { readStorefrontSettings, type StorefrontSettings } from "@/features/shops/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { type Enums } from "@/types/database.types";

export type ShopSummary = {
  id: string;
  name: string;
  slug: string;
  status: Enums<"shop_status">;
  currency: string;
  customDomain: string | null;
  createdAt: string;
  settings: StorefrontSettings;
  branding: Branding;
  domainToken: string | null;
  domainVerifiedAt: string | null;
  cartReminders: { enabled: boolean; hours: number; code: string | null };
};

/** Shops in an organization that the current user may access (RLS-filtered). */
export const listShops = cache(async (organizationId: string): Promise<ShopSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select(
      "id, name, slug, status, currency, custom_domain, domain_token, domain_verified_at, created_at, settings",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw fromPostgrestError(error);

  return data.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    status: s.status,
    currency: s.currency,
    customDomain: s.custom_domain,
    createdAt: s.created_at,
    settings: readStorefrontSettings(s.settings),
    branding: brandingSchema.parse((s.settings as Record<string, unknown> | null)?.branding),
    domainToken: s.domain_token,
    domainVerifiedAt: s.domain_verified_at,
    cartReminders: readCartReminders(s.settings),
  }));
});

export const getShop = cache(
  async (organizationId: string, shopId: string): Promise<ShopSummary | null> => {
    const shops = await listShops(organizationId);
    return shops.find((s) => s.id === shopId) ?? null;
  },
);

function readCartReminders(settings: unknown) {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    enabled: s.cart_reminders === true,
    hours: typeof s.cart_reminder_hours === "number" ? s.cart_reminder_hours : 3,
    code: typeof s.cart_reminder_code === "string" ? s.cart_reminder_code : null,
  };
}
