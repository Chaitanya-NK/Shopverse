import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { env } from "@/env";
import { routes } from "@/config/routes";
import { shopperSchema } from "@/features/shopper/schemas";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shopper sessions are separate from staff (Supabase Auth) sessions: an opaque
 * 256-bit token in an httpOnly cookie scoped to the shop's path. The database
 * keeps only its sha256 and checks it on every call.
 */
export const SHOPPER_COOKIE = "sv_shopper";
/** The pending sign-in (which code we're waiting for); short-lived. */
export const SIGN_IN_COOKIE = "sv_signin";

const SESSION_DAYS = 30;
const TOKEN = /^[0-9a-f]{64}$/;

const cookieOptions = (shopSlug: string, maxAge: number) => ({
  path: routes.storefront(shopSlug),
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  maxAge,
});

export async function readShopperToken(): Promise<string | null> {
  const value = (await cookies()).get(SHOPPER_COOKIE)?.value;
  return value && TOKEN.test(value) ? value : null;
}

export async function setShopperToken(shopSlug: string, token: string) {
  (await cookies()).set(SHOPPER_COOKIE, token, cookieOptions(shopSlug, SESSION_DAYS * 86_400));
}

export async function clearShopperToken(shopSlug: string) {
  (await cookies()).delete({ name: SHOPPER_COOKIE, path: routes.storefront(shopSlug) });
}

export async function signInCookie(shopSlug: string) {
  const jar = await cookies();
  return {
    get: () => jar.get(SIGN_IN_COOKIE)?.value ?? null,
    set: (id: string) => jar.set(SIGN_IN_COOKIE, id, cookieOptions(shopSlug, 60 * 60)),
    clear: () => jar.delete({ name: SIGN_IN_COOKIE, path: routes.storefront(shopSlug) }),
  };
}

/** The signed-in shopper for this shop, or null. Cached per request. */
export const getShopper = cache(async (shopId: string) => {
  const token = await readShopperToken();
  if (!token) return null;
  const { data, error } = await createAdminClient().rpc("shopper_me", {
    p_shop_id: shopId,
    p_token: token,
  });
  if (error) throw fromPostgrestError(error);
  return data ? shopperSchema.parse(data) : null;
});

/** For actions: the token, or "please sign in". */
export async function requireShopperToken(): Promise<string> {
  const token = await readShopperToken();
  if (!token) throw Errors.unauthenticated();
  return token;
}
