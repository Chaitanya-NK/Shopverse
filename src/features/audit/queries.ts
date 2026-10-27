import "server-only";

import { cache } from "react";

import { AUDIT_PAGE_SIZE } from "@/features/audit/search-params";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type AuditEntry = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
};

export type AuditFilters = {
  type: string | null;
  actor: string | null;
  from: Date | null;
  to: Date | null;
  page: number;
};

/** Audit entries, newest first (owners and admins only, via RLS). */
export const listAudit = cache(async (organizationId: string, filters: AuditFilters) => {
  const supabase = await createClient();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * AUDIT_PAGE_SIZE;

  let query = supabase
    .from("audit_log_view")
    .select("id, action, entity_type, entity_id, metadata, created_at, actor_id, actor_name", {
      count: "exact",
    })
    .eq("organization_id", organizationId);
  if (filters.type) query = query.eq("entity_type", filters.type);
  if (filters.actor === "system") query = query.is("actor_id", null);
  else if (filters.actor && /^[0-9a-f-]{36}$/.test(filters.actor))
    query = query.eq("actor_id", filters.actor);
  // Dates are whole days in India time.
  if (filters.from)
    query = query.gte("created_at", `${filters.from.toISOString().slice(0, 10)}T00:00:00+05:30`);
  if (filters.to)
    query = query.lte("created_at", `${filters.to.toISOString().slice(0, 10)}T23:59:59.999+05:30`);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);
  if (error) throw fromPostgrestError(error);

  const total = count ?? 0;
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    items: data.map((e): AuditEntry => ({
      id: e.id,
      action: e.action,
      entityType: e.entity_type,
      entityId: e.entity_id,
      metadata: e.metadata,
      createdAt: e.created_at,
      actorId: e.actor_id,
      actorName: e.actor_name,
    })),
  };
});
