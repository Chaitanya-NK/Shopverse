"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { authorizeOrganization } from "@/features/organizations/server";
import { slugSchema } from "@/features/organizations/schemas";
import { purchaseOrderEmail } from "@/features/purchasing/emails";
import { getPurchaseOrder } from "@/features/purchasing/queries";
import {
  placePurchaseOrderSchema,
  purchaseOrderFormSchema,
  purchaseOrderRefSchema,
  receivePurchaseOrderSchema,
  supplierFormSchema,
} from "@/features/purchasing/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { containsPattern } from "@/lib/postgrest";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const MANAGE = "Only owners, admins and managers can manage purchasing.";
const manager = (supabase: ServerSupabaseClient, userId: string, slug: string) =>
  authorizeOrganization(supabase, userId, slug, "purchasing.manage", MANAGE);

export const saveSupplier = createAction({
  name: "purchasing.saveSupplier",
  schema: supplierFormSchema,
  handler: async (input, { supabase, user }) => {
    const org = await manager(supabase, user.id, input.organizationSlug);
    const row = {
      name: input.name,
      contact_name: input.contactName,
      email: input.email,
      phone: input.phone,
      gstin: input.gstin,
      address: {
        line1: input.line1 ?? "",
        city: input.city ?? "",
        state: input.state ?? "",
        postalCode: input.postalCode ?? "",
      },
      payment_terms: input.paymentTerms,
      lead_time_days: input.leadTimeDays,
      notes: input.notes,
      is_active: input.isActive,
    };
    const { data, error } = input.supplierId
      ? await supabase
          .from("suppliers")
          .update(row)
          .eq("id", input.supplierId)
          .eq("organization_id", org.id)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("suppliers")
          .insert({ ...row, organization_id: org.id })
          .select("id")
          .single();
    if (error) {
      if (error.code === "23505")
        throw Errors.conflict("You already have a supplier with this name.", {
          name: ["Already used. Try another name."],
        });
      throw fromPostgrestError(error);
    }
    if (!data) throw Errors.notFound("Supplier");
    refresh();
    return { supplierId: data.id, name: input.name };
  },
});

export const savePurchaseOrder = createAction({
  name: "purchasing.saveOrder",
  schema: purchaseOrderFormSchema,
  handler: async (input, { supabase, user }) => {
    const org = await manager(supabase, user.id, input.organizationSlug);
    const { data, error } = await supabase.rpc("save_purchase_order", {
      p_organization_id: org.id,
      p_purchase_order_id: input.purchaseOrderId ?? (null as unknown as string),
      p_supplier_id: input.supplierId,
      p_warehouse_id: input.warehouseId,
      p_items: input.lines.map((l) => ({
        variant_id: l.variantId,
        quantity: l.quantity,
        unit_cost: l.unitCost,
        tax_rate: l.taxRate,
      })),
      p_expected_at: input.expectedAt ?? undefined,
      p_supplier_reference: input.supplierReference ?? undefined,
      p_notes: input.notes ?? undefined,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { purchaseOrderId: data };
  },
});

export const placePurchaseOrder = createAction({
  name: "purchasing.place",
  schema: placePurchaseOrderSchema,
  handler: async (input, { supabase, user }) => {
    const org = await manager(supabase, user.id, input.organizationSlug);
    const { error } = await supabase.rpc("place_purchase_order", {
      p_purchase_order_id: input.purchaseOrderId,
    });
    if (error) throw fromPostgrestError(error);
    let emailed = false;
    if (input.emailSupplier) {
      const po = await getPurchaseOrder(org.id, input.purchaseOrderId);
      if (po?.supplier.email) {
        try {
          const { data: orgRow } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", org.id)
            .single();
          const a = po.warehouse.address;
          await sendMail(
            purchaseOrderEmail({
              to: po.supplier.email,
              replyTo: user.email ?? null,
              businessName: orgRow?.name ?? "",
              supplierName: po.supplier.contactName ?? po.supplier.name,
              number: po.number,
              expectedAt: po.expectedAt,
              deliverTo: {
                name: po.warehouse.name,
                address: [a.line1, a.city, a.state, a.postalCode].filter(Boolean).join(", "),
              },
              notes: po.notes,
              lines: po.lines.map((l) => ({
                sku: l.sku,
                title: `${l.productTitle}${l.title && l.title !== "Default" ? ` · ${l.title}` : ""}`,
                quantity: l.quantity,
                unitCost: l.unitCost,
                taxRate: l.taxRate,
              })),
              subtotal: po.subtotal,
              tax: po.taxTotal,
              total: po.total,
            }),
          );
          emailed = true;
        } catch (cause) {
          logger.warn({ err: cause, purchaseOrderId: input.purchaseOrderId }, "PO email failed");
        }
      }
    }
    refresh();
    return { emailed };
  },
});

export const receivePurchaseOrder = createAction({
  name: "purchasing.receive",
  schema: receivePurchaseOrderSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "purchasing.receive",
      "Only staff who handle stock can receive deliveries.",
    );
    const { data, error } = await supabase.rpc("receive_purchase_order", {
      p_purchase_order_id: input.purchaseOrderId,
      p_lines: input.lines.map((l) => ({
        item_id: l.itemId,
        quantity: l.quantity,
        serials: l.serials,
        batch_code: l.batchCode,
        expiry_date: l.expiryDate,
      })),
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return data as { status: string; received: number };
  },
});

export const closePurchaseOrder = createAction({
  name: "purchasing.close",
  schema: purchaseOrderRefSchema,
  handler: async (input, { supabase, user }) => {
    await manager(supabase, user.id, input.organizationSlug);
    const { data, error } = await supabase.rpc("close_purchase_order", {
      p_purchase_order_id: input.purchaseOrderId,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { status: data as "closed" | "cancelled" };
  },
});

export type PurchasableVariant = {
  id: string;
  sku: string;
  title: string;
  productTitle: string;
  costPrice: number | null;
  gstRate: number | null;
};

/** Variant search for purchase orders: any product that isn't archived, with its last cost. */
export const searchPurchasableVariants = createAction({
  name: "purchasing.searchVariants",
  schema: z.object({ organizationSlug: slugSchema, query: z.string().trim().max(100) }),
  handler: async (input, { supabase, user }): Promise<PurchasableVariant[]> => {
    const org = await manager(supabase, user.id, input.organizationSlug);
    let query = supabase
      .from("variant_search")
      .select("id, sku, variant_title, product_title, gst_rate")
      .eq("organization_id", org.id)
      .neq("product_status", "archived");
    if (input.query) query = query.ilike("search_text", containsPattern(input.query.toLowerCase()));
    const { data, error } = await query.order("product_title").order("sku").limit(20);
    if (error) throw fromPostgrestError(error);
    if (data.length === 0) return [];
    const { data: costs, error: costError } = await supabase
      .from("product_variants")
      .select("id, cost_price")
      .in(
        "id",
        data.map((v) => v.id),
      );
    if (costError) throw fromPostgrestError(costError);
    const cost = new Map(costs.map((c) => [c.id, c.cost_price]));
    return data.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.variant_title,
      productTitle: v.product_title,
      costPrice: cost.get(v.id) ?? null,
      gstRate: v.gst_rate,
    }));
  },
});
