import "server-only";

import { cache } from "react";

import { CUSTOMERS_PAGE_SIZE } from "@/features/customers/search-params";
import { fromPostgrestError } from "@/lib/errors";
import { containsPattern } from "@/lib/postgrest";
import { createClient } from "@/lib/supabase/server";

export type CustomerSummary = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  verified: boolean;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
};

const COLUMNS =
  "id, full_name, email, phone, email_verified_at, orders_count, total_spent, last_order_at, created_at" as const;

function toSummary(c: {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  email_verified_at: string | null;
  orders_count: number | null;
  total_spent: number | null;
  last_order_at: string | null;
  created_at: string;
}): CustomerSummary {
  return {
    id: c.id,
    name: c.full_name,
    email: c.email,
    phone: c.phone,
    verified: c.email_verified_at !== null,
    ordersCount: Number(c.orders_count ?? 0),
    totalSpent: Number(c.total_spent ?? 0),
    lastOrderAt: c.last_order_at,
    createdAt: c.created_at,
  };
}

export const listCustomers = cache(
  async (organizationId: string, filters: { q: string; page: number }) => {
    const supabase = await createClient();
    const page = Math.max(1, filters.page);
    const from = (page - 1) * CUSTOMERS_PAGE_SIZE;

    let query = supabase
      .from("customer_overview")
      .select(COLUMNS, { count: "exact" })
      .eq("organization_id", organizationId);
    const q = filters.q.trim().toLowerCase().slice(0, 100);
    if (q) query = query.ilike("search_text", containsPattern(q));

    const { data, error, count } = await query
      .order("last_order_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + CUSTOMERS_PAGE_SIZE - 1);
    if (error) throw fromPostgrestError(error);

    const total = count ?? 0;
    return {
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)),
      items: data.map(toSummary),
    };
  },
);

export const getCustomer = cache(async (organizationId: string, customerId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_overview")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ? toSummary(data) : null;
});
