import "server-only";

import { type EmailOtpType } from "@supabase/supabase-js";

import { routes, safeReturnTo } from "@/config/routes";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

import { clearPendingEmail } from "./internal/pending-email";

const EMAIL_LINK_TYPES: readonly EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "invite",
  "email_change",
];

type ConfirmParams = {
  tokenHash: string | null;
  type: string | null;
  code: string | null;
  next: string | null;
};

/**
 * Completes sign-in from the link in the email. Supports both shapes Supabase
 * can send:
 *  - our template: /auth/confirm?token_hash=…&type=email   (works in any browser)
 *  - default template: …/auth/confirm?code=…               (PKCE; same browser only)
 * Returns the path to redirect to.
 */
export async function confirmEmailLink({
  tokenHash,
  type,
  code,
  next,
}: ConfirmParams): Promise<string> {
  const destination = safeReturnTo(next);
  const supabase = await createClient();

  if (tokenHash && type && (EMAIL_LINK_TYPES as readonly string[]).includes(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error) {
      await clearPendingEmail();
      return destination;
    }
    logger.info({ code: error.code }, "Email link verification failed");
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await clearPendingEmail();
      return destination;
    }
    logger.info({ code: error.code }, "Email link code exchange failed");
  }

  return `${routes.signIn(next ?? undefined)}${next ? "&" : "?"}error=link_expired`;
}
