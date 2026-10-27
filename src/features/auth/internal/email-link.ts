import "server-only";

import { env } from "@/env";
import { RETURN_TO_PARAM, routes, safeReturnTo } from "@/config/routes";

/**
 * Where the link in the sign-in email lands. The email contains both the
 * 6-digit code and this link, so users can use whichever is convenient.
 * The host must be listed under Auth → URL Configuration → Redirect URLs.
 */
export function emailConfirmUrl(next?: string): string {
  const url = new URL(routes.authConfirm, env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set(RETURN_TO_PARAM, safeReturnTo(next));
  return url.toString();
}
