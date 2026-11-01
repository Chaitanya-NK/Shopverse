import { env } from "@/env";
import { logger } from "@/lib/logger";

type Entry = { slug: string | null; expires: number };
const cache = new Map<string, Entry>();
const HIT_MS = 60_000;
const MISS_MS = 30_000;

/**
 * Which shop a custom domain serves (verified and live), cached briefly in
 * memory. Uses the public RPC with the publishable key, so it works in the
 * proxy without a service key.
 */
export async function shopSlugForHost(host: string): Promise<string | null> {
  const key = host.split(":")[0]!.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/shop_for_domain`, {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_host: key }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (res.ok) {
      const value = (await res.json()) as unknown;
      slug = typeof value === "string" && value ? value : null;
    }
  } catch (cause) {
    logger.warn({ err: cause, host: key }, "Custom domain lookup failed");
    return null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, { slug, expires: Date.now() + (slug ? HIT_MS : MISS_MS) });
  return slug;
}
