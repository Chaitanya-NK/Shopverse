import "server-only";

import { cookies } from "next/headers";

import { OTP_EXPIRY_MINUTES } from "@/features/auth/constants";

/**
 * The address a code was sent to is kept in a short-lived, httpOnly cookie
 * rather than the URL, so emails don't leak into browser history, analytics
 * or server logs, and the verify step can't be pointed at another address.
 */
const COOKIE = "sv_pending_email";

export async function setPendingEmail(email: string) {
  const store = await cookies();
  store.set(COOKIE, email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OTP_EXPIRY_MINUTES * 60,
  });
}

export async function getPendingEmail(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function clearPendingEmail() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Mask an address for display: "priya@urbanthreads.in" -> "pr•••@urbanthreads.in". */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
