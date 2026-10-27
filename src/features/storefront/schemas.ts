import { z } from "zod";

import { productImageObjectSchema, productImageSchema } from "@/features/products/images";
import { Constants } from "@/types/database.types";

const money = z.coerce.number();
const nullableMoney = z.coerce.number().nullable();

// Shapes returned by the storefront_* database functions (jsonb), validated
// at the boundary so pages never trust unchecked JSON.

export const storefrontShopSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    currency: z.string(),
    live: z.boolean(),
    tagline: z.string().nullable(),
    support_email: z.string().nullable(),
    support_phone: z.string().nullable(),
    shipping_fee: money,
    free_shipping_over: nullableMoney,
    cod_limit: nullableMoney,
  })
  .transform((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    currency: s.currency,
    live: s.live,
    tagline: s.tagline,
    supportEmail: s.support_email,
    supportPhone: s.support_phone,
    shippingFee: s.shipping_fee,
    freeShippingOver: s.free_shipping_over,
    codLimit: s.cod_limit,
  }));
export type StorefrontShop = z.output<typeof storefrontShopSchema>;

export const catalogSchema = z.object({
  total: z.coerce.number(),
  items: z.array(
    z
      .object({
        id: z.uuid(),
        slug: z.string(),
        title: z.string(),
        category: z.string().nullable(),
        industry: z.string().nullable(),
        min_price: money,
        max_price: money,
        compare_at: nullableMoney,
        in_stock: z.boolean().nullable(),
        image: productImageSchema,
      })
      .transform((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        category: p.category,
        industry: p.industry,
        minPrice: p.min_price,
        maxPrice: p.max_price,
        compareAt: p.compare_at,
        inStock: Boolean(p.in_stock),
        image: p.image,
      })),
  ),
});
export type CatalogItem = z.output<typeof catalogSchema>["items"][number];

export const categoriesSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    industry: z.string().nullable(),
    group: z.string(),
    count: z.coerce.number(),
  }),
);
export type StorefrontCategory = z.output<typeof categoriesSchema>[number];

const optionValue = z.union([z.string(), z.number()]);

export const productSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    tracking: z.enum(Constants.public.Enums.inventory_tracking),
    images: z.array(productImageObjectSchema).optional().default([]),
    category: z
      .object({ id: z.uuid(), name: z.string(), industry: z.string().nullable() })
      .nullable(),
    details: z.array(
      z.object({
        label: z.string(),
        unit: z.string().nullable(),
        type: z.string(),
        value: z.unknown(),
      }),
    ),
    axes: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        unit: z.string().nullable(),
        type: z.string(),
      }),
    ),
    variants: z.array(
      z.object({
        id: z.uuid(),
        sku: z.string(),
        title: z.string(),
        options: z.record(z.string(), optionValue),
        price: money,
        compare_at: nullableMoney,
        available: z.coerce.number(),
      }),
    ),
  })
  .transform((p) => ({
    ...p,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      options: v.options,
      price: v.price,
      compareAt: v.compare_at,
      available: v.available,
    })),
  }));
export type StorefrontProduct = z.output<typeof productSchema>;
export type StorefrontVariant = StorefrontProduct["variants"][number];

export const cartVariantsSchema = z.array(
  z
    .object({
      id: z.uuid(),
      sku: z.string(),
      title: z.string(),
      product_title: z.string(),
      product_slug: z.string(),
      price: money,
      compare_at: nullableMoney,
      available: z.coerce.number(),
      gst_rate: money,
      image: productImageSchema,
    })
    .transform((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      productTitle: v.product_title,
      productSlug: v.product_slug,
      price: v.price,
      compareAt: v.compare_at,
      available: v.available,
      gstRate: v.gst_rate,
      image: v.image,
    })),
);
export type CartVariant = z.output<typeof cartVariantsSchema>[number];

export const customerOrderSchema = z.object({
  number: z.string(),
  placed_at: z.string(),
  status: z.enum(Constants.public.Enums.order_status),
  payment_method: z.enum(Constants.public.Enums.payment_method).nullable(),
  payment_status: z.enum(Constants.public.Enums.payment_status),
  fulfillment_status: z.enum(Constants.public.Enums.fulfillment_status),
  currency: z.string(),
  subtotal: money,
  discount_total: money,
  shipping_total: money,
  tax_total: money,
  grand_total: money,
  ship_to: z.object({
    name: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postal_code: z.string().nullable(),
  }),
  shop: z.object({
    name: z.string(),
    slug: z.string(),
    support_email: z.string().nullable(),
    support_phone: z.string().nullable(),
  }),
  items: z.array(
    z.object({ title: z.string(), quantity: z.number(), unit_price: money, total: money }),
  ),
  shipments: z.array(
    z.object({
      number: z.string().nullable(),
      status: z.enum(Constants.public.Enums.shipment_status),
      tracking_token: z.string(),
    }),
  ),
});
export type CustomerOrder = z.output<typeof customerOrderSchema>;

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 20;

export const cartLineSchema = z.object({
  v: z.uuid(),
  q: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});
export const cartSchema = z.array(cartLineSchema).max(MAX_CART_LINES);
export type CartLine = z.output<typeof cartLineSchema>;

/** Parse the cart cookie defensively: anything malformed becomes an empty cart. */
export function parseCart(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    // Merge duplicate variants.
    const merged = new Map<string, number>();
    for (const line of parsed.data)
      merged.set(line.v, Math.min((merged.get(line.v) ?? 0) + line.q, MAX_LINE_QUANTITY));
    return [...merged].map(([v, q]) => ({ v, q }));
  } catch {
    return [];
  }
}

/** Add or change a line. quantity 0 removes it. */
export function setCartLine(
  cart: CartLine[],
  variantId: string,
  quantity: number,
  mode: "add" | "set",
): CartLine[] {
  const current = cart.find((l) => l.v === variantId)?.q ?? 0;
  const next = Math.max(
    0,
    Math.min(mode === "add" ? current + quantity : quantity, MAX_LINE_QUANTITY),
  );
  const others = cart.filter((l) => l.v !== variantId);
  if (next === 0) return others;
  if (current === 0 && others.length >= MAX_CART_LINES) return cart;
  return current === 0
    ? [...others, { v: variantId, q: next }]
    : cart.map((l) => (l.v === variantId ? { v: l.v, q: next } : l));
}

// ---------------------------------------------------------------------------
// Catalogue URL state
// ---------------------------------------------------------------------------

export const CATALOG_SORTS = {
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  name: "Name",
} as const;
export type CatalogSort = keyof typeof CATALOG_SORTS;
export const CATALOG_PAGE_SIZE = 24;

/** Shipping the shop charges for a subtotal. */
export function shippingFor(
  subtotal: number,
  shop: Pick<StorefrontShop, "shippingFee" | "freeShippingOver">,
): number {
  if (shop.freeShippingOver !== null && subtotal >= shop.freeShippingOver) return 0;
  return shop.shippingFee;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const shopSlugSchema = z.string().regex(/^[a-z0-9-]{3,48}$/);

/** An Indian mobile number as people type it ("98765 43210", "+91 98765-43210"). */
export const indianMobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^(\+91)?[6-9][0-9]{9}$/, "Enter a 10-digit mobile number"));

/** "9876543210" -> "+919876543210" (already-prefixed numbers are kept). */
export function toIndianE164(mobile: string): string {
  return mobile.startsWith("+") ? mobile : `+91${mobile}`;
}

/** Street address fields shared by checkout and the address book. */
export const streetAddressSchema = z.object({
  line1: z.string().trim().min(5, "Enter your house and street").max(200),
  line2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(2, "Enter your city").max(80),
  state: z.string().trim().min(2, "Choose your state").max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code"),
});
export type StreetAddress = z.output<typeof streetAddressSchema>;

export const checkoutDetailsSchema = z.object({
  shopSlug: shopSlugSchema,
  contact: z.object({
    name: z.string().trim().min(2, "Enter your name").max(120),
    email: z.email("Enter a valid email").max(254),
    phone: indianMobileSchema,
  }),
  address: streetAddressSchema,
  note: z.string().trim().max(300, "Keep it under 300 characters").optional().default(""),
});
export type CheckoutDetailsInput = z.input<typeof checkoutDetailsSchema>;

export const checkoutCodeSchema = z.object({
  shopSlug: shopSlugSchema,
  otp: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Enter the 6-digit code"),
});

export const checkoutResendSchema = z.object({ shopSlug: shopSlugSchema });

/** "asha@example.com" -> "as***@example.com" for on-screen hints. */
export function maskEmailAddress(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}
