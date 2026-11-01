import "server-only";

import { routes } from "@/config/routes";
import { env } from "@/env";
import { cartReminderEmail } from "@/features/marketing/emails";
import { productImageUrl } from "@/features/products/images";
import { type CartLine } from "@/features/storefront/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

const appUrl = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

/** A signed-in shopper's cart changed: keep it for a reminder (or close it when empty). */
export async function trackShopperCart(shopId: string, token: string, lines: CartLine[]) {
  try {
    const { error } = await createAdminClient().rpc("shopper_track_cart", {
      p_shop_id: shopId,
      p_token: token,
      p_lines: lines.map((l) => ({ variant_id: l.v, quantity: l.q })),
    });
    if (error) throw error;
  } catch (cause) {
    logger.warn({ err: cause, shopId }, "Tracking a cart failed");
  }
}

type Due = {
  id: string;
  email: string;
  name: string | null;
  token: string;
  subtotal: number;
  discount_code: string | null;
  shop: { name: string; slug: string; support_email: string | null; color: string | null };
  items: { title: string; quantity: number; price: number; image: string | null }[];
};

/** Email reminders that are due; a failed email goes back in the queue. */
export async function sendCartReminders(now = new Date()) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_cart_reminders", { p_now: now.toISOString() });
  if (error) throw fromPostgrestError(error);
  let sent = 0;
  for (const cart of (data ?? []) as Due[]) {
    try {
      await sendMail(
        cartReminderEmail({
          to: cart.email,
          name: cart.name,
          shopName: cart.shop.name,
          color: cart.shop.color ?? "#1d6b5c",
          items: cart.items.map((i) => ({
            title: i.title,
            quantity: i.quantity,
            price: Number(i.price),
            imageUrl: i.image ? productImageUrl(i.image, "thumb") : null,
          })),
          subtotal: Number(cart.subtotal),
          discountCode: cart.discount_code,
          restoreUrl: appUrl(routes.storefrontCartRestore(cart.shop.slug, cart.token)),
          stopUrl: appUrl(routes.storefrontCartStop(cart.shop.slug, cart.token)),
          supportEmail: cart.shop.support_email,
        }),
      );
      sent += 1;
    } catch (cause) {
      logger.warn({ err: cause, cartId: cart.id }, "Cart reminder failed");
      await admin.rpc("release_cart_reminder", { p_id: cart.id });
    }
  }
  return sent;
}
