import "server-only";

import { cache } from "react";

import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type CartRecoveryStats = {
  abandoned: number;
  reminded: number;
  clicked: number;
  recovered: number;
  recoveredTotal: number;
};

export const getCartRecoveryStats = cache(
  async (organizationId: string): Promise<CartRecoveryStats> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cart_recovery_stats", {
      p_organization_id: organizationId,
    });
    if (error) throw fromPostgrestError(error);
    const s = (data ?? {}) as Record<string, unknown>;
    const n = (k: string) => Number(s[k] ?? 0);
    return {
      abandoned: n("abandoned"),
      reminded: n("reminded"),
      clicked: n("clicked"),
      recovered: n("recovered"),
      recoveredTotal: n("recovered_total"),
    };
  },
);

export type CartRecoveryRow = {
  id: string;
  shopId: string;
  email: string;
  name: string | null;
  units: number;
  subtotal: number;
  source: "checkout" | "account";
  status: "open" | "reminded" | "recovered" | "closed";
  lastActivityAt: string;
  remindedAt: string | null;
  clickedAt: string | null;
  recoveredOrderId: string | null;
};

export const listCartRecoveries = cache(
  async (organizationId: string): Promise<CartRecoveryRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cart_recoveries")
      .select(
        "id, shop_id, email, name, lines, subtotal, source, status, last_activity_at, reminded_at, clicked_at, recovered_order_id",
      )
      .eq("organization_id", organizationId)
      .order("last_activity_at", { ascending: false })
      .limit(50);
    if (error) throw fromPostgrestError(error);
    return data.map((r) => ({
      id: r.id,
      shopId: r.shop_id,
      email: r.email,
      name: r.name,
      units: Array.isArray(r.lines)
        ? r.lines.reduce(
            (n: number, l) => n + Number((l as { quantity?: number } | null)?.quantity ?? 0),
            0,
          )
        : 0,
      subtotal: Number(r.subtotal),
      source: r.source as CartRecoveryRow["source"],
      status: r.status as CartRecoveryRow["status"],
      lastActivityAt: r.last_activity_at,
      remindedAt: r.reminded_at,
      clickedAt: r.clicked_at,
      recoveredOrderId: r.recovered_order_id,
    }));
  },
);
