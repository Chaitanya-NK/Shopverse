"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";

import {
  addressIdSchema,
  cancelOrderSchema,
  orderAccessSchema,
  orderTokenSchema,
  profileSchema,
  saveAddressSchema,
  shopOnlySchema,
  shopperSchema,
  signedInCheckoutSchema,
  signInCodeSchema,
  signInEmailSchema,
  toAddressJson,
  wishlistSchema,
} from "@/features/shopper/schemas";
import {
  clearShopperToken,
  readShopperToken,
  requireShopperToken,
  setShopperToken,
  signInCookie,
} from "@/features/shopper/session";
import { clearCart, readCartLines, writeCartLines } from "@/features/storefront/cart-cookie";
import { signInCodeEmail } from "@/features/storefront/emails";
import { getCart, getStorefrontShop } from "@/features/storefront/queries";
import {
  cartVariantsSchema,
  maskEmailAddress,
  MAX_LINE_QUANTITY,
  setCartLine,
  toIndianE164,
} from "@/features/storefront/schemas";
import { notifyOrder } from "@/features/notifications/order-notifier";
import { refundDuePayments } from "@/features/payments/server";
import { createAction } from "@/lib/actions/create-action";
import { type AppError, Errors, fromPostgrestError } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireShop(slug: string) {
  const shop = await getStorefrontShop(slug);
  if (!shop) throw Errors.notFound("Shop");
  return shop;
}

async function requireLiveShop(slug: string) {
  const shop = await requireShop(slug);
  if (!shop.live) throw Errors.validation({}, "This shop is a preview and isn't open yet.");
  return shop;
}

/**
 * Map a shopper_* function error. An ended session also clears the cookie so
 * the next page shows the shopper as signed out.
 */
async function shopperError(shopSlug: string, error: Parameters<typeof fromPostgrestError>[0]) {
  const appError: AppError = fromPostgrestError(error);
  if (error.code === "42501") {
    await clearShopperToken(shopSlug);
    return Errors.unauthenticated();
  }
  return appError;
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

export const startShopperSignIn = createAction({
  name: "shopper.startSignIn",
  schema: signInEmailSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireLiveShop(input.shopSlug);
    const { data, error } = await createAdminClient().rpc("shopper_sign_in_start", {
      p_shop_id: shop.id,
      p_email: input.email,
    });
    if (error) throw fromPostgrestError(error);

    const result = data as { sign_in_id: string; otp: string; email: string };
    await sendMail(signInCodeEmail({ to: result.email, shopName: shop.name, code: result.otp }));
    (await signInCookie(shop.slug)).set(result.sign_in_id);
    return { email: maskEmailAddress(result.email) };
  },
});

export const resendShopperSignIn = createAction({
  name: "shopper.resendSignIn",
  schema: shopOnlySchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireLiveShop(input.shopSlug);
    const id = (await signInCookie(shop.slug)).get();
    if (!id) throw Errors.validation({}, "Your sign-in expired. Please enter your email again.");

    const { data, error } = await createAdminClient().rpc("shopper_sign_in_resend", {
      p_sign_in_id: id,
    });
    if (error) throw fromPostgrestError(error);
    const result = data as { otp: string; email: string; sends_left: number };
    await sendMail(signInCodeEmail({ to: result.email, shopName: shop.name, code: result.otp }));
    return { sendsLeft: result.sends_left };
  },
});

export const verifyShopperSignIn = createAction({
  name: "shopper.verifySignIn",
  schema: signInCodeSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireLiveShop(input.shopSlug);
    const pending = await signInCookie(shop.slug);
    const id = pending.get();
    if (!id) throw Errors.validation({}, "Your sign-in expired. Please enter your email again.");

    const { data, error } = await createAdminClient().rpc("shopper_sign_in_verify", {
      p_sign_in_id: id,
      p_otp: input.code,
      p_user_agent: (await headers()).get("user-agent") ?? undefined,
    });
    if (error) throw fromPostgrestError(error);

    const result = data as {
      ok: boolean;
      token?: string;
      needs_name?: boolean;
      attempts_left?: number;
      message?: string;
    };
    if (!result.ok || !result.token) {
      const left = result.attempts_left;
      throw Errors.validation({
        code: [
          typeof left === "number"
            ? left > 0
              ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
              : "That code is not right. Ask for a new code."
            : (result.message ?? "That code can't be used."),
        ],
      });
    }

    pending.clear();
    await setShopperToken(shop.slug, result.token);
    return { needsName: Boolean(result.needs_name) };
  },
});

export const signOutShopper = createAction({
  name: "shopper.signOut",
  schema: shopOnlySchema,
  requireAuth: false,
  handler: async (input) => {
    const token = await readShopperToken();
    if (token) {
      const { error } = await createAdminClient().rpc("shopper_sign_out", { p_token: token });
      if (error) throw fromPostgrestError(error);
    }
    await clearShopperToken(input.shopSlug);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Profile and addresses
// ---------------------------------------------------------------------------

export const updateShopperProfile = createAction({
  name: "shopper.updateProfile",
  schema: profileSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const { error } = await createAdminClient().rpc("shopper_update_profile", {
      p_shop_id: shop.id,
      p_token: await requireShopperToken(),
      p_profile: {
        name: input.name,
        phone: input.phone ? toIndianE164(input.phone) : null,
        accepts_marketing: input.acceptsMarketing,
      },
    });
    if (error) {
      if (error.code === "23505") throw Errors.conflict(error.message, { phone: [error.message] });
      throw await shopperError(shop.slug, error);
    }
    refresh();
    return null;
  },
});

export const saveShopperAddress = createAction({
  name: "shopper.saveAddress",
  schema: saveAddressSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const { data, error } = await createAdminClient().rpc("shopper_save_address", {
      p_shop_id: shop.id,
      p_token: await requireShopperToken(),
      p_address: toAddressJson({ ...input.address, phone: toIndianE164(input.address.phone) }),
      p_address_id: input.addressId,
    });
    if (error) throw await shopperError(shop.slug, error);
    refresh();
    return { id: data as string };
  },
});

export const deleteShopperAddress = createAction({
  name: "shopper.deleteAddress",
  schema: addressIdSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const { error } = await createAdminClient().rpc("shopper_delete_address", {
      p_shop_id: shop.id,
      p_token: await requireShopperToken(),
      p_address_id: input.addressId,
    });
    if (error) throw await shopperError(shop.slug, error);
    refresh();
    return null;
  },
});

export const setDefaultShopperAddress = createAction({
  name: "shopper.setDefaultAddress",
  schema: addressIdSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const { error } = await createAdminClient().rpc("shopper_set_default_address", {
      p_shop_id: shop.id,
      p_token: await requireShopperToken(),
      p_address_id: input.addressId,
    });
    if (error) throw await shopperError(shop.slug, error);
    refresh();
    return null;
  },
});

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export const setWishlist = createAction({
  name: "shopper.setWishlist",
  schema: wishlistSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const { error } = await createAdminClient().rpc("shopper_set_wishlist", {
      p_shop_id: shop.id,
      p_token: await requireShopperToken(),
      p_product_id: input.productId,
      p_saved: input.saved,
    });
    if (error) throw await shopperError(shop.slug, error);
    refresh();
    return { saved: input.saved };
  },
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const cancelMyOrder = createAction({
  name: "shopper.cancelOrder",
  schema: cancelOrderSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const { error } = await createAdminClient().rpc("shopper_cancel_order", {
      p_shop_id: shop.id,
      p_token: await requireShopperToken(),
      p_order_token: input.orderToken,
      p_reason: input.reason || undefined,
    });
    if (error) throw await shopperError(shop.slug, error);

    const { data: order } = await createAdminClient()
      .from("orders")
      .select("id")
      .eq("public_token", input.orderToken)
      .maybeSingle();
    if (order) {
      notifyOrder(order.id, { type: "cancelled", byCustomer: true });
      await refundDuePayments(order.id);
    }
    refresh();
    return null;
  },
});

/** Put an earlier order's items back in the cart, as far as stock allows. */
export const reorder = createAction({
  name: "shopper.reorder",
  schema: orderTokenSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("shopper_order_access", {
      p_shop_id: shop.id,
      p_token: await requireShopperToken(),
      p_order_token: input.orderToken,
    });
    if (error) throw await shopperError(shop.slug, error);
    if (!data) throw Errors.notFound("Order");
    const { lines } = orderAccessSchema.parse(data);

    const { data: variantData, error: variantError } = await admin.rpc("storefront_variants", {
      p_shop_id: shop.id,
      p_variant_ids: lines.map((l) => l.variantId),
    });
    if (variantError) throw fromPostgrestError(variantError);
    const variants = new Map(cartVariantsSchema.parse(variantData ?? []).map((v) => [v.id, v]));

    let cart = await readCartLines();
    let added = 0;
    for (const line of lines) {
      const variant = variants.get(line.variantId);
      if (!variant || variant.available <= 0) continue;
      const inCart = cart.find((l) => l.v === line.variantId)?.q ?? 0;
      const quantity = Math.min(line.quantity, variant.available - inCart, MAX_LINE_QUANTITY);
      if (quantity <= 0) continue;
      cart = setCartLine(cart, line.variantId, quantity, "add");
      added += 1;
    }
    if (added === 0) throw Errors.validation({}, "None of these items are available right now.");

    await writeCartLines(shop.slug, cart);
    return { added, unavailable: lines.length - added };
  },
});

// ---------------------------------------------------------------------------
// Signed-in checkout
// ---------------------------------------------------------------------------

export const placeSignedInOrder = createAction({
  name: "shopper.checkout",
  schema: signedInCheckoutSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireLiveShop(input.shopSlug);
    const token = await requireShopperToken();
    const admin = createAdminClient();

    const { data: me, error: meError } = await admin.rpc("shopper_me", {
      p_shop_id: shop.id,
      p_token: token,
    });
    if (meError) throw fromPostgrestError(meError);
    if (!me) {
      await clearShopperToken(shop.slug);
      throw Errors.unauthenticated();
    }
    const shopper = shopperSchema.parse(me);

    const saved = input.addressId
      ? shopper.addresses.find((a) => a.id === input.addressId)
      : undefined;
    if (input.addressId && !saved)
      throw Errors.validation({ addressId: ["Choose a delivery address"] });
    const address = saved ?? {
      ...input.address!,
      phone: toIndianE164(input.address!.phone),
    };

    const cart = await getCart(shop.id);
    if (cart.length === 0) throw Errors.validation({}, "Your cart is empty.");

    const { data, error } = await admin.rpc("shopper_checkout", {
      p_shop_id: shop.id,
      p_token: token,
      p_request_id: input.requestId,
      p_lines: cart.map((line) => ({ variant_id: line.id, quantity: line.quantity })),
      p_contact: { name: address.name, phone: address.phone, note: input.note || null },
      p_address: {
        name: address.name,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2 || null,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: "IN",
      },
      p_payment_method: input.paymentMethod,
      p_save_address: !saved && input.saveAddress,
    });
    if (error) throw await shopperError(shop.slug, error);

    const order = data as {
      order_id: string;
      order_number: string;
      public_token: string;
      grand_total: number;
      awaiting_payment: boolean;
    };
    await clearCart(shop.slug);
    // Online orders are confirmed (and emailed) once the payment arrives.
    if (!order.awaiting_payment) notifyOrder(order.order_id, { type: "confirmed" });
    return {
      token: order.public_token,
      number: order.order_number,
      awaitingPayment: order.awaiting_payment,
    };
  },
});
