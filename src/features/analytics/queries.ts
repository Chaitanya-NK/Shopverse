import "server-only";

import { cache } from "react";
import { z } from "zod";

import { salesReportSchema } from "@/features/analytics/schemas";
import { invoiceSchema } from "@/features/invoices/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Totals, trend and breakdowns for a range (row-level security applies). */
export const getSalesReport = cache(
  async (organizationId: string, from: string, to: string, shopId: string | null) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("sales_report", {
      p_organization_id: organizationId,
      p_from: from,
      p_to: to,
      ...(shopId ? { p_shop_id: shopId } : {}),
    });
    if (error) throw fromPostgrestError(error);
    return salesReportSchema.parse(data);
  },
);

/** Every invoice issued in a month ("YYYY-MM"), oldest first. */
export const getMonthInvoices = cache(
  async (organizationId: string, month: string, shopId: string | null) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("gst_invoices", {
      p_organization_id: organizationId,
      p_month: `${month}-01`,
      ...(shopId ? { p_shop_id: shopId } : {}),
    });
    if (error) throw fromPostgrestError(error);
    return z.array(invoiceSchema).parse(data ?? []);
  },
);
