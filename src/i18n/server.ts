import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { isLocale, type Locale, LOCALE_COOKIE, makeTranslate, type Translate } from "@/i18n/core";
import { hi } from "@/i18n/hi";

export function dictionaryFor(locale: Locale) {
  return locale === "hi" ? hi : null;
}

export function translator(locale: Locale): Translate {
  return makeTranslate(locale, dictionaryFor(locale));
}

/** The shopper's language: their choice (cookie), else the shop's default. */
export const getLocale = cache(async (shopDefault: string | null | undefined): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return isLocale(shopDefault) ? shopDefault : "en";
});

/** Translate for a storefront page or action. */
export async function getT(shopDefault: string | null | undefined): Promise<Translate> {
  return translator(await getLocale(shopDefault));
}

/** A storefront page's <title> in the shopper's language. */
export async function storefrontTitle(shopSlug: string, title: string): Promise<string> {
  const { getStorefrontShop } = await import("@/features/storefront/queries");
  const shop = await getStorefrontShop(shopSlug);
  return (await getT(shop?.language))(title);
}

/** Remember the language an order was placed in, for its emails and messages. */
export async function recordOrderLocale(orderId: string, locale: Locale) {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { error } = await createAdminClient().rpc("set_order_locale", {
    p_order_id: orderId,
    p_locale: locale,
  });
  if (error) throw error;
}
