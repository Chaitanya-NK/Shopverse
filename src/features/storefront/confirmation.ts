import "server-only";

import { env } from "@/env";
import { routes } from "@/config/routes";
import { orderConfirmationEmail } from "@/features/storefront/emails";
import { type StorefrontShop } from "@/features/storefront/schemas";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email the customer that their storefront order is confirmed. A courtesy:
 * the order stands even if the email can't be sent, so failures are logged.
 */
export async function sendOrderConfirmation(
  shop: Pick<StorefrontShop, "name" | "slug" | "currency" | "supportEmail">,
  order: { orderId: string; number: string; token: string; total: number },
) {
  try {
    const { data } = await createAdminClient()
      .from("orders")
      .select("customer:customers (email)")
      .eq("id", order.orderId)
      .maybeSingle();
    const email = data?.customer?.email;
    if (!email) return;
    await sendMail(
      orderConfirmationEmail({
        to: email,
        shopName: shop.name,
        orderNumber: order.number,
        total: order.total,
        currency: shop.currency,
        orderUrl: new URL(
          routes.storefrontOrder(shop.slug, order.token),
          env.NEXT_PUBLIC_APP_URL,
        ).toString(),
        replyTo: shop.supportEmail,
      }),
    );
  } catch (cause) {
    logger.warn({ err: cause, order: order.number }, "Order confirmation email failed");
  }
}
