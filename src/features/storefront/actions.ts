"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { readCartLines, writeCartLines } from "@/features/storefront/cart-cookie";
import { cartVariantsSchema, MAX_LINE_QUANTITY, setCartLine } from "@/features/storefront/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const shopSlug = z.string().regex(/^[a-z0-9-]{3,48}$/);

const cartChangeSchema = z.object({
  shopSlug,
  variantId: z.uuid(),
  quantity: z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY),
  mode: z.enum(["add", "set"]),
});

async function resolveShop(supabase: ServerSupabaseClient, slug: string) {
  const { data, error } = await supabase.rpc("storefront_shop", { p_slug: slug });
  if (error) throw fromPostgrestError(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw Errors.notFound("Shop");
  return id;
}

/** Add to or change the cart (an httpOnly cookie scoped to the shop's path). */
export const changeCart = createAction({
  name: "storefront.changeCart",
  schema: cartChangeSchema,
  requireAuth: false,
  handler: async (input, { supabase }) => {
    const shopId = await resolveShop(supabase, input.shopSlug);
    const cart = await readCartLines();

    let quantity = input.quantity;
    if (quantity > 0) {
      const { data, error } = await supabase.rpc("storefront_variants", {
        p_shop_id: shopId,
        p_variant_ids: [input.variantId],
      });
      if (error) throw fromPostgrestError(error);
      const variant = cartVariantsSchema.parse(data ?? [])[0];
      if (!variant) throw Errors.validation({ variantId: ["This item is no longer available"] });

      const inCart = cart.find((l) => l.v === input.variantId)?.q ?? 0;
      const wanted = input.mode === "add" ? inCart + quantity : quantity;
      if (variant.available <= 0)
        throw Errors.validation({ variantId: ["Sorry, this is out of stock"] });
      if (wanted > variant.available) {
        // Keep what's possible and say so.
        quantity =
          input.mode === "add" ? Math.max(variant.available - inCart, 0) : variant.available;
        if (quantity === 0)
          throw Errors.validation({ variantId: [`Only ${variant.available} available`] });
      }
    }

    const next = setCartLine(cart, input.variantId, quantity, input.mode);
    await writeCartLines(input.shopSlug, next);

    refresh();
    return { count: next.reduce((n, l) => n + l.q, 0), limited: quantity !== input.quantity };
  },
});
