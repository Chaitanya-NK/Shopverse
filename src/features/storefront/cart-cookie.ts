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

export async function clearCart(shopSlug: string) {
  (await cookies()).delete({ name: CART_COOKIE, path: routes.storefront(shopSlug) });
}
