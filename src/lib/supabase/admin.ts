import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { type Database } from "@/types/database.types";

/**
 * Service-role client for trusted server code only (storefront checkout).
 * It bypasses RLS, so callers must validate input and only call database
 * functions that enforce their own rules. Never import from client code.
 */
export function createAdminClient() {
  if (!env.SUPABASE_SECRET_KEY) {
    throw new AppError(
      "UNAVAILABLE",
      "Checkout isn't set up yet. The shop owner needs to add SUPABASE_SECRET_KEY on the server.",
    );
  }
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
