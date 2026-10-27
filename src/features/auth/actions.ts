"use server";

import { redirect } from "next/navigation";

import { routes, safeReturnTo } from "@/config/routes";
import { clearPendingEmail, getPendingEmail, setPendingEmail } from "./internal/pending-email";
import {
  resendOtpSchema,
  signInSchema,
  signUpSchema,
  verifyOtpSchema,
} from "@/features/auth/schemas";
import { createAction } from "@/lib/actions/create-action";
import { AppError, Errors, fromAuthError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * Step 1 (returning users): email a one-time code.
 * To prevent account enumeration we behave identically whether or not the
 * address has an account; the verify screen explains what to do if no code arrives.
 */
export const requestSignInCode = createAction({
  name: "auth.requestSignInCode",
  schema: signInSchema,
  requireAuth: false,
  handler: async ({ email, next }, { supabase }) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error && !isUnknownUserError(error)) {
      throw fromAuthError(error);
    }

    await setPendingEmail(email);
    redirect(routes.verify(safeReturnTo(next)));
  },
});

/** Step 1 (new users): create the account (unconfirmed) and email a verification code. */
export const requestSignUpCode = createAction({
  name: "auth.requestSignUpCode",
  schema: signUpSchema,
  requireAuth: false,
  handler: async ({ email, fullName, next }, { supabase }) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: { full_name: fullName } },
    });
    if (error) {
      throw fromAuthError(error);
    }

    await setPendingEmail(email);
    redirect(routes.verify(safeReturnTo(next, routes.onboarding)));
  },
});

/** Step 2: exchange the 6-digit code for a session. */
export const verifyCode = createAction({
  name: "auth.verifyCode",
  schema: verifyOtpSchema,
  requireAuth: false,
  handler: async ({ token, next }, { supabase }) => {
    const email = await getPendingEmail();
    if (!email) {
      throw new AppError(
        "VALIDATION",
        "Your verification session expired. Please request a new code.",
      );
    }

    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.session) {
      throw error ? fromAuthError(error) : Errors.internal();
    }

    await clearPendingEmail();
    logger.info({ userId: data.user?.id }, "User verified email OTP");
    redirect(safeReturnTo(next));
  },
});

/** Resend the code to the pending address. Supabase enforces the server-side cooldown. */
export const resendCode = createAction({
  name: "auth.resendCode",
  schema: resendOtpSchema,
  requireAuth: false,
  handler: async (_input, { supabase }) => {
    const email = await getPendingEmail();
    if (!email) {
      throw new AppError("VALIDATION", "Your verification session expired. Please start again.");
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error && !isUnknownUserError(error)) {
      throw fromAuthError(error);
    }

    await setPendingEmail(email); // extend the cookie's lifetime
    return { sentAt: new Date().toISOString() };
  },
});

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(routes.signIn());
}

/** Supabase reports unknown users differently across versions; treat all as "no account". */
function isUnknownUserError(error: { code?: string; message: string }) {
  return (
    error.code === "otp_disabled" ||
    error.code === "user_not_found" ||
    /signups not allowed/i.test(error.message)
  );
}
