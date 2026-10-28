import { z } from "zod";

import { Constants } from "@/types/database.types";

const money = z.coerce.number();
const text = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const party = z.object({
  name: text,
  phone: text,
  line1: text,
  line2: text,
  city: text,
  state: text,
  postal_code: text,
});

/** Shape returned by order_invoice / storefront_invoice (jsonb). */
export const invoiceSchema = z
  .object({
    number: z.string(),
    issued_at: z.string(),
    order_number: z.string(),
    placed_at: z.string(),
    payment_method: z.enum(Constants.public.Enums.payment_method).nullable(),
    payment_status: z.enum(Constants.public.Enums.payment_status),
    currency: z.string(),
    seller: party.extend({
      shop_name: z.string(),
      legal_name: z.string(),
      gstin: text,
      email: text,
      phone: text,
    }),
    buyer: party,
    subtotal: money,
    discount_total: money,
    discount_code: z.string().nullable().optional().default(null),
    shipping_total: money,
    grand_total: money,
    items: z.array(
      z.object({
        title: z.string(),
        sku: z.string().nullable(),
        hsn_code: z.string().nullable(),
        quantity: z.number().int(),
        unit_price: money,
        total: money,
        gst_rate: money,
        tax_amount: money,
        discount_amount: money.optional().default(0),
      }),
    ),
  })
  .transform((i) => ({
    number: i.number,
    issuedAt: i.issued_at,
    orderNumber: i.order_number,
    placedAt: i.placed_at,
    paymentMethod: i.payment_method,
    paymentStatus: i.payment_status,
    currency: i.currency,
    seller: {
      shopName: i.seller.shop_name,
      legalName: i.seller.legal_name,
      gstin: i.seller.gstin,
      line1: i.seller.line1,
      city: i.seller.city,
      state: i.seller.state,
      postalCode: i.seller.postal_code,
      email: i.seller.email,
      phone: i.seller.phone,
    },
    buyer: {
      name: i.buyer.name,
      phone: i.buyer.phone,
      line1: i.buyer.line1,
      line2: i.buyer.line2,
      city: i.buyer.city,
      state: i.buyer.state,
      postalCode: i.buyer.postal_code,
    },
    subtotal: i.subtotal,
    discountTotal: i.discount_total,
    discountCode: i.discount_code,
    shippingTotal: i.shipping_total,
    grandTotal: i.grand_total,
    items: i.items.map((l) => ({
      title: l.title,
      sku: l.sku,
      hsnCode: l.hsn_code,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      total: l.total,
      gstRate: l.gst_rate,
      taxAmount: l.tax_amount,
      discountAmount: l.discount_amount,
    })),
  }));
export type Invoice = z.output<typeof invoiceSchema>;
