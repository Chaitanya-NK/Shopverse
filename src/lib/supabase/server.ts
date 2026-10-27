import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { env } from "@/env";
import { type Database } from "@/types/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user, so every query is subject to Row Level Security.
 * Create one per request; never share across requests.
 */
export async function createClient() {
  // Supabase reads the clock (token expiry) and per-user cookies, so its data is
  // always request-time. connection() keeps it out of static and prefetch
  // prerendering, which forbid non-deterministic values like Date.now().
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Safe to ignore: the proxy
            // refreshes the session on every request before rendering.
          }
        },
      },
    },
  );
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
