import { routes } from "@/config/routes";

/**
 * The shop's service worker, scoped to /s/<shop>/. Pages are always fetched
 * from the network (prices and stock must be live); if the network is down, a
 * cached offline page is shown. Built assets (/_next/static, content-hashed)
 * are cached for speed. Nothing personal is ever cached.
 */
export async function GET(_request: Request, ctx: RouteContext<"/s/[shopSlug]/sw.js">) {
  const { shopSlug } = await ctx.params;
  if (!/^[a-z0-9-]{3,48}$/.test(shopSlug)) return new Response("Not found", { status: 404 });
  const offline = routes.storefrontOffline(shopSlug);
  const script = `
const CACHE = "shopverse-${shopSlug}-v1";
const OFFLINE = ${JSON.stringify(offline)};
const SHOP = ${JSON.stringify(routes.storefront(shopSlug))};
// The scope is "/s/<shop>" so the shop's home page is covered; that prefix
// also matches "/s/<shop>-other", which this worker leaves alone.
const inShop = (path) => path === SHOP || path.startsWith(SHOP + "/");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("shopverse-${shopSlug}-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate" && !inShop(url.pathname)) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
`;
  return new Response(script, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-cache",
      // Allows the scope "/s/<shop>" (without the slash) for a script under it.
      "service-worker-allowed": routes.storefront(shopSlug),
    },
  });
}
