import "server-only";

import { cookies } from "next/headers";

import { env } from "@/env";
import { routes } from "@/config/routes";
import { type CartLine, parseCart } from "@/features/storefront/schemas";

/** The cart lives in an httpOnly cookie scoped to the shop's path. */
export const CART_COOKIE = "sv_cart";

export async function readCartLines(): Promise<CartLine[]> {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

export async function writeCartLines(shopSlug: string, lines: CartLine[]) {
  (await cookies()).set(CART_COOKIE, JSON.stringify(lines), {
    path: routes.storefront(shopSlug),
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** After an order: empty the cart and forget the applied code. */
export async function clearCart(shopSlug: string) {
  const jar = await cookies();
  jar.delete({ name: CART_COOKIE, path: routes.storefront(shopSlug) });
  jar.delete({ name: DISCOUNT_COOKIE, path: routes.storefront(shopSlug) });
}

/** The discount code a shopper applied (validated again at checkout). */
export const DISCOUNT_COOKIE = "sv_discount";

export async function readDiscountCode(): Promise<string | null> {
  const value = (await cookies()).get(DISCOUNT_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{3,32}$/.test(value) ? value : null;
}

export async function writeDiscountCode(shopSlug: string, code: string | null) {
  const jar = await cookies();
  if (!code) {
    jar.delete({ name: DISCOUNT_COOKIE, path: routes.storefront(shopSlug) });
    return;
  }
  jar.set(DISCOUNT_COOKIE, code, {
    path: routes.storefront(shopSlug),
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}
