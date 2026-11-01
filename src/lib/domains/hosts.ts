/**
 * Hosts that serve Shopverse itself (the app, local development, Codespaces
 * port forwarding). Any other host may be a shop's custom domain.
 */
export function isPlatformHost(host: string, appUrl: string, forwardingDomain?: string): boolean {
  const name = host.split(":")[0]!.toLowerCase();
  if (!name) return true;
  let appHost = "";
  try {
    appHost = new URL(appUrl).hostname.toLowerCase();
  } catch {
    // env validation reports a bad URL
  }
  if (name === appHost || name === "localhost" || name === "127.0.0.1" || name === "[::1]")
    return true;
  const suffixes = [".github.dev", ".githubpreview.dev"];
  if (forwardingDomain) suffixes.push(`.${forwardingDomain.toLowerCase()}`);
  return suffixes.some((s) => name.endsWith(s));
}

/** The host a request was made to, behind proxies too. */
export function requestHost(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-host");
  return (forwarded ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
}

/** Rewrite target for a request on a shop's domain (null: serve the path as it is). */
export function customDomainPath(pathname: string, slug: string): string | null {
  if (
    pathname.startsWith("/s/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/track/")
  )
    return null;
  return `/s/${slug}${pathname === "/" ? "" : pathname}`;
}
