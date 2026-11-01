import { NextResponse } from "next/server";

import { routes } from "@/config/routes";
import { writeCartLines, writeDiscountCode } from "@/features/storefront/cart-cookie";
import { cartSchema } from "@/features/storefront/schemas";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * From the cart reminder email: put the cart back (items still for sale) and
 * the shop's comeback code, then open the cart.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/s/[shopSlug]/cart/restore/[token]">,
) {
  const { shopSlug, token } = await ctx.params;
  const cart = new URL(routes.storefrontCart(shopSlug), request.url);
  if (!/^[0-9a-f]{48}$/.test(token)) return NextResponse.redirect(cart);
  try {
    const { data, error } = await createAdminClient().rpc("cart_recovery_restore", {
      p_token: token,
    });
    if (error) throw error;
    const restored = data as {
      shop_slug: string;
      discount_code: string | null;
      lines: { variantId: string; quantity: number }[];
    } | null;
    if (restored && restored.shop_slug === shopSlug) {
      const lines = cartSchema.safeParse(
        restored.lines.map((l) => ({ v: l.variantId, q: l.quantity })),
      );
      if (lines.success && lines.data.length > 0) await writeCartLines(shopSlug, lines.data);
      if (restored.discount_code) await writeDiscountCode(shopSlug, restored.discount_code);
    }
  } catch (cause) {
    logger.warn({ err: cause }, "Restoring a cart failed");
  }
  return NextResponse.redirect(cart);
}
