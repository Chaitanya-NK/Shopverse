/**
 * Fixed-window rate limits, checked in the proxy before a request reaches the
 * app. Counts live in memory (each server on its own), or in Upstash Redis
 * when UPSTASH_REDIS_REST_URL/TOKEN are set (shared by every server).
 */

export type RateRule = {
  name: string;
  /** Requests allowed per window, per client address. */
  limit: number;
  windowSeconds: number;
  match: (request: { method: string; path: string; isAction: boolean }) => boolean;
};

// Storefront paths work with or without /s/<shop> (custom domains drop it).
const shop = (rest: string) => new RegExp(`^(/s/[a-z0-9-]+)?${rest}`);

/** First match wins. Generous for people, tight where guessing or spam pays. */
export const RATE_RULES: RateRule[] = [
  {
    name: "sign-in",
    limit: 20,
    windowSeconds: 60,
    match: (r) =>
      r.method === "POST" &&
      (/^\/(sign-in|sign-up|verify)/.test(r.path) ||
        shop("/(account/sign-in|checkout)").test(r.path)),
  },
  {
    name: "tokens",
    limit: 30,
    windowSeconds: 60,
    match: (r) => /^\/track\//.test(r.path) || shop("/(orders/|cart/(restore|stop)/)").test(r.path),
  },
  { name: "error-reports", limit: 30, windowSeconds: 60, match: (r) => r.path === "/api/errors" },
  {
    name: "webhooks",
    limit: 600,
    windowSeconds: 60,
    match: (r) => r.path.startsWith("/api/webhooks/"),
  },
  { name: "cron", limit: 30, windowSeconds: 60, match: (r) => r.path.startsWith("/api/cron/") },
  {
    name: "actions",
    limit: 120,
    windowSeconds: 60,
    match: (r) => r.method === "POST" && r.isAction,
  },
  { name: "pages", limit: 600, windowSeconds: 60, match: () => true },
];

export type RateResult = {
  ok: boolean;
  rule: string;
  limit: number;
  remaining: number;
  resetSeconds: number;
};

type Store = (key: string, windowSeconds: number) => Promise<number>;

// ------------------------------------------------------------------- memory
const counters = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;
const memoryStore: Store = async (key, windowSeconds) => {
  const now = Date.now();
  if (now - lastSweep > 60_000 || counters.size > 50_000) {
    lastSweep = now;
    for (const [k, v] of counters) if (v.resetAt <= now) counters.delete(k);
  }
  const entry = counters.get(key);
  if (!entry || entry.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count++;
  return entry.count;
};

// ------------------------------------------------------------------- upstash
function upstashStore(url: string, token: string): Store {
  return async (key, windowSeconds) => {
    const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds), "NX"],
      ]),
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) throw new Error(`Upstash ${response.status}`);
    const [incr] = (await response.json()) as [{ result: number }];
    return incr.result;
  };
}

/** The client address as seen by the first proxy (Vercel, a load balancer). */
export function clientAddress(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  ).slice(0, 64);
}

export async function checkRateLimit(
  request: { method: string; path: string; isAction: boolean; address: string },
  options: { upstashUrl?: string; upstashToken?: string; now?: number } = {},
): Promise<RateResult | null> {
  const rule = RATE_RULES.find((r) => r.match(request));
  if (!rule) return null;
  const now = options.now ?? Date.now();
  const window = Math.floor(now / 1000 / rule.windowSeconds);
  const key = `rl:${rule.name}:${request.address}:${window}`;
  const resetSeconds = (window + 1) * rule.windowSeconds - Math.floor(now / 1000);
  let count: number;
  try {
    count =
      options.upstashUrl && options.upstashToken
        ? await upstashStore(options.upstashUrl, options.upstashToken)(key, rule.windowSeconds)
        : await memoryStore(key, rule.windowSeconds);
  } catch {
    // If the shared store is down, fall back to this server's own count.
    count = await memoryStore(key, rule.windowSeconds);
  }
  return {
    ok: count <= rule.limit,
    rule: rule.name,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetSeconds,
  };
}
