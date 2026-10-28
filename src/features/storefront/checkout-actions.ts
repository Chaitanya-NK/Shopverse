"use server";

import { cookies } from "next/headers";

import { env } from "@/env";
import { routes } from "@/config/routes";
import { checkoutCodeEmail } from "@/features/storefront/emails";
import { clearCart, readDiscountCode } from "@/features/storefront/cart-cookie";
import { getCart, getStorefrontShop } from "@/features/storefront/queries";
import {
  checkoutCodeSchema,
  checkoutDetailsSchema,
  checkoutResendSchema,
  maskEmailAddress,
  toIndianE164,
} from "@/features/storefront/schemas";
import { notifyOrder } from "@/features/notifications/order-notifier";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

const CHECKOUT_COOKIE = "sv_checkout";

async function requireLiveShop(slug: string) {
  const shop = await getStorefrontShop(slug);
  if (!shop) throw Errors.notFound("Shop");
  if (!shop.live)
    throw Errors.validation({}, "This shop is a preview and isn't taking orders yet.");
  return shop;
}

async function checkoutCookie(slug: string) {
  const jar = await cookies();
  return {
    get: () => jar.get(CHECKOUT_COOKIE)?.value ?? null,
    set: (id: string) =>
      jar.set(CHECKOUT_COOKIE, id, {
        path: routes.storefront(slug),
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: 60 * 60,
      }),
    clear: async () => {
      jar.delete({ name: CHECKOUT_COOKIE, path: routes.storefront(slug) });
      await clearCart(slug);
    },
  };
}

/**
 * Step 1: validate details, re-price the cart in the database, and email a
 * 6-digit code. The code itself never reaches the browser.
 */
export const startCheckout = createAction({
  name: "storefront.startCheckout",
  schema: checkoutDetailsSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireLiveShop(input.shopSlug);
    const cart = await getCart(shop.id);
    if (cart.length === 0) throw Errors.validation({}, "Your cart is empty.");

    const phone = toIndianE164(input.contact.phone);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("storefront_checkout_start", {
      p_shop_id: shop.id,
      p_lines: cart.map((line) => ({ variant_id: line.id, quantity: line.quantity })),
      p_contact: {
        name: input.contact.name,
        email: input.contact.email,
        phone,
        note: input.note || null,
      },
      p_address: {
        name: input.contact.name,
        phone,
        line1: input.address.line1,
        line2: input.address.line2,
        city: input.address.city,
        state: input.address.state,
        postal_code: input.address.postalCode,
        country: "IN",
      },
      p_payment_method: input.paymentMethod,
      // Re-checked here with the shopper's email (first order, once per customer).
      p_discount_code: (await readDiscountCode()) ?? undefined,
    });
    if (error) throw fromPostgrestError(error);

    const session = data as {
      checkout_id: string;
      otp: string;
      email: string;
      grand_total: number;
    };
    await sendMail(
      checkoutCodeEmail({
        to: session.email,
        shopName: shop.name,
        code: session.otp,
        total: Number(session.grand_total),
        currency: shop.currency,
      }),
    );
    (await checkoutCookie(shop.slug)).set(session.checkout_id);

    return { email: maskEmailAddress(session.email), total: Number(session.grand_total) };
  },
});

export const resendCheckoutCode = createAction({
  name: "storefront.resendCheckoutCode",
  schema: checkoutResendSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireLiveShop(input.shopSlug);
    const id = (await checkoutCookie(shop.slug)).get();
    if (!id) throw Errors.validation({}, "Your checkout expired. Please enter your details again.");

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("storefront_checkout_resend", { p_checkout_id: id });
    if (error) throw fromPostgrestError(error);

    const result = data as { otp: string; email: string; sends_left: number };
    await sendMail(
      checkoutCodeEmail({
        to: result.email,
        shopName: shop.name,
        code: result.otp,
        currency: shop.currency,
      }),
    );
    return { sendsLeft: result.sends_left };
  },
});

/** Step 2: check the code; on success the order is placed and stock reserved. */
export const confirmCheckout = createAction({
  name: "storefront.confirmCheckout",
  schema: checkoutCodeSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireLiveShop(input.shopSlug);
    const cookie = await checkoutCookie(shop.slug);
    const id = cookie.get();
    if (!id) throw Errors.validation({}, "Your checkout expired. Please enter your details again.");

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("storefront_checkout_confirm", {
      p_checkout_id: id,
      p_otp: input.otp,
    });
    if (error) throw fromPostgrestError(error);

    const result = data as {
      ok: boolean;
      message?: string;
      attempts_left?: number;
      locked?: boolean;
      expired?: boolean;
      order_id?: string;
      order_number?: string;
      public_token?: string;
      grand_total?: number;
      awaiting_payment?: boolean;
    };
    if (!result.ok) {
      const left = result.attempts_left;
      throw Errors.validation({
        otp: [
          typeof left === "number"
            ? left > 0
              ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
              : "That code is not right. Ask for a new code."
            : (result.message ?? "That code can't be used."),
        ],
      });
    }

    await cookie.clear();

    // Online orders are confirmed (and emailed) once the payment arrives.
    if (!result.awaiting_payment) notifyOrder(result.order_id!, { type: "confirmed" });

    return {
      token: result.public_token!,
      number: result.order_number!,
      awaitingPayment: Boolean(result.awaiting_payment),
    };
  },
});
