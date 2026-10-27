import "server-only";

import { cache } from "react";

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
};

/** Shops in an organization that the current user may access (RLS-filtered). */
export const listShops = cache(async (organizationId: string): Promise<ShopSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select("id, name, slug, status, currency, custom_domain, created_at, settings")
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
  }));
});
