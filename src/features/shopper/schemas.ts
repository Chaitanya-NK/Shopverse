import { z } from "zod";

import {
  CHECKOUT_PAYMENT_METHODS,
  indianMobileSchema,
  shopSlugSchema,
  streetAddressSchema,
} from "@/features/storefront/schemas";
import { ORDER_STAGES } from "@/features/shopper/stages";
import { Constants } from "@/types/database.types";

export { ORDER_STAGE_LABELS, ORDER_STAGES, type OrderStage } from "@/features/shopper/stages";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const signInEmailSchema = z.object({
  shopSlug: shopSlugSchema,
  email: z.email("Enter a valid email").max(254),
});
export type SignInEmailInput = z.input<typeof signInEmailSchema>;

export const signInCodeSchema = z.object({
  shopSlug: shopSlugSchema,
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Enter the 6-digit code"),
});

export const shopOnlySchema = z.object({ shopSlug: shopSlugSchema });

export const profileSchema = z.object({
  shopSlug: shopSlugSchema,
  name: z.string().trim().min(2, "Enter your name").max(120),
  phone: z
    .union([z.literal(""), indianMobileSchema])
    .optional()
    .default(""),
  acceptsMarketing: z.boolean().optional().default(false),
});
export type ProfileInput = z.input<typeof profileSchema>;

export const addressSchema = streetAddressSchema.extend({
  label: z.string().trim().max(40, "Keep it under 40 characters").optional().default(""),
  name: z.string().trim().min(2, "Enter the recipient's name").max(120),
  phone: indianMobileSchema,
  isDefault: z.boolean().optional().default(false),
});
export type AddressInput = z.input<typeof addressSchema>;

export const saveAddressSchema = z.object({
  shopSlug: shopSlugSchema,
  addressId: z.uuid().optional(),
  address: addressSchema,
});

export const addressIdSchema = z.object({ shopSlug: shopSlugSchema, addressId: z.uuid() });

export const wishlistSchema = z.object({
  shopSlug: shopSlugSchema,
  productId: z.uuid(),
  saved: z.boolean(),
});

export const orderTokenSchema = z.object({
  shopSlug: shopSlugSchema,
  orderToken: z.string().regex(/^[0-9a-f]{32}$/),
});

export const cancelOrderSchema = orderTokenSchema.extend({
  reason: z.string().trim().max(300, "Keep it under 300 characters").optional().default(""),
});

/** Signed-in checkout: a saved address or a new one, contact from the account. */
export const signedInCheckoutSchema = z
  .object({
    shopSlug: shopSlugSchema,
    requestId: z.uuid(),
    addressId: z.string().optional().default(""),
    address: addressSchema.omit({ label: true, isDefault: true }).optional(),
    saveAddress: z.boolean().optional().default(true),
    note: z.string().trim().max(300, "Keep it under 300 characters").optional().default(""),
    paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS).optional().default("cod"),
  })
  .superRefine((value, ctx) => {
    if (!value.addressId && !value.address)
      ctx.addIssue({ code: "custom", path: ["addressId"], message: "Choose a delivery address" });
  });
export type SignedInCheckoutInput = z.input<typeof signedInCheckoutSchema>;

// ---------------------------------------------------------------------------
// Database shapes (jsonb from shopper_* functions)
// ---------------------------------------------------------------------------

export const savedAddressSchema = z
  .object({
    id: z.uuid(),
    label: z.string().nullable(),
    name: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    is_default: z.boolean(),
  })
  .transform((a) => ({
    id: a.id,
    label: a.label,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state,
    postalCode: a.postal_code,
    isDefault: a.is_default,
  }));
export type SavedAddress = z.output<typeof savedAddressSchema>;

export const shopperSchema = z
  .object({
    id: z.uuid(),
    name: z.string().nullable(),
    email: z.string(),
    phone: z.string().nullable(),
    accepts_marketing: z.boolean(),
    addresses: z.array(savedAddressSchema),
    wishlist: z.array(z.uuid()),
  })
  .transform((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    acceptsMarketing: s.accepts_marketing,
    addresses: s.addresses,
    wishlist: s.wishlist,
  }));
export type Shopper = z.output<typeof shopperSchema>;

export const shopperOrdersSchema = z.object({
  total: z.coerce.number(),
  items: z.array(
    z
      .object({
        number: z.string(),
        placed_at: z.string(),
        status: z.enum(Constants.public.Enums.order_status),
        stage: z.enum(ORDER_STAGES),
        grand_total: z.coerce.number(),
        currency: z.string(),
        public_token: z.string(),
        can_cancel: z.boolean(),
        item_count: z.coerce.number(),
        titles: z.array(z.string()),
      })
      .transform((o) => ({
        number: o.number,
        placedAt: o.placed_at,
        status: o.status,
        stage: o.stage,
        grandTotal: o.grand_total,
        currency: o.currency,
        token: o.public_token,
        canCancel: o.can_cancel,
        itemCount: o.item_count,
        titles: o.titles,
      })),
  ),
});
export type ShopperOrder = z.output<typeof shopperOrdersSchema>["items"][number];

export const orderAccessSchema = z
  .object({
    can_cancel: z.boolean(),
    lines: z.array(z.object({ variant_id: z.uuid(), quantity: z.number().int() })),
  })
  .transform((a) => ({
    canCancel: a.can_cancel,
    lines: a.lines.map((l) => ({ variantId: l.variant_id, quantity: l.quantity })),
  }));

/** One line for an address card: "12 MG Road, Indiranagar, Pune 411001". */
export function formatAddressLine(
  a: Pick<SavedAddress, "line1" | "line2" | "city" | "state" | "postalCode">,
) {
  return [a.line1, a.line2, `${a.city} ${a.postalCode}`, a.state].filter(Boolean).join(", ");
}

/** Saved address -> the jsonb shape orders and the address book store. */
export function toAddressJson(
  a: Pick<SavedAddress, "name" | "phone" | "line1" | "line2" | "city" | "state" | "postalCode"> & {
    label?: string | null;
    isDefault?: boolean;
  },
) {
  return {
    label: a.label || null,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || null,
    city: a.city,
    state: a.state,
    postal_code: a.postalCode,
    country: "IN",
    is_default: a.isDefault ?? false,
  };
}
