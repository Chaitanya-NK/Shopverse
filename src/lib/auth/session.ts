import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { routes } from "@/config/routes";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
};

/**
 * Data Access Layer entry point for "who is signed in".
 * Verifies the JWT (getClaims) instead of trusting the cookie payload, and is
 * memoised per request with React `cache` so many components can call it.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return null;
  }

  const { claims } = data;
  const fullName =
    typeof claims.user_metadata?.full_name === "string" ? claims.user_metadata.full_name : null;

  return { id: claims.sub, email: claims.email ?? "", fullName };
});

/** Returns the signed-in user or redirects to sign-in (preserving the target path). */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(routes.signIn(returnTo));
  }
  return user;
}
