/** Send a browser error to /api/errors (at most 10 per page load, never throws). */
let sent = 0;
const seen = new Set<string>();

export function reportClientError(
  error: unknown,
  kind: "boundary" | "unhandled" | "rejection",
  digest?: string,
) {
  try {
    if (typeof window === "undefined" || sent >= 10) return;
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${err.name}:${err.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent++;
    const body = JSON.stringify({
      name: err.name.slice(0, 100),
      message: (err.message || "Error").slice(0, 2000),
      stack: err.stack?.slice(0, 8000),
      path: window.location.pathname,
      digest,
      kind,
    });
    if (!navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" })))
      void fetch("/api/errors", {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      });
  } catch {
    // Reporting must never break the page.
  }
}
