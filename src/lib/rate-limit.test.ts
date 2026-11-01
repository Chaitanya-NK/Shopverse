import { describe, expect, it } from "vitest";

import { checkRateLimit, clientAddress, RATE_RULES } from "@/lib/rate-limit";

const rule = (method: string, path: string, isAction = false) =>
  RATE_RULES.find((r) => r.match({ method, path, isAction }))?.name;

describe("rate limit rules", () => {
  it("picks the tightest matching rule", () => {
    expect(rule("POST", "/sign-in", true)).toBe("sign-in");
    expect(rule("POST", "/s/urban/checkout", true)).toBe("sign-in");
    expect(rule("POST", "/checkout", true)).toBe("sign-in"); // custom domain
    expect(rule("GET", "/track/abc")).toBe("tokens");
    expect(rule("GET", "/s/urban/orders/abc")).toBe("tokens");
    expect(rule("GET", "/cart/restore/abc")).toBe("tokens");
    expect(rule("POST", "/api/errors")).toBe("error-reports");
    expect(rule("POST", "/api/webhooks/stripe/platform")).toBe("webhooks");
    expect(rule("POST", "/app/x/orders", true)).toBe("actions");
    expect(rule("GET", "/s/urban")).toBe("pages");
  });

  it("counts per address and window, then refuses", async () => {
    const req = { method: "POST", path: "/sign-in", isAction: true, address: "203.0.113.9" };
    const now = Date.UTC(2026, 0, 1, 0, 0, 5);
    for (let i = 0; i < 20; i++) expect((await checkRateLimit(req, { now }))!.ok).toBe(true);
    const over = (await checkRateLimit(req, { now }))!;
    expect(over.ok).toBe(false);
    expect(over.resetSeconds).toBe(55);
    // Someone else is unaffected, and the next minute starts afresh.
    expect((await checkRateLimit({ ...req, address: "203.0.113.10" }, { now }))!.ok).toBe(true);
    expect((await checkRateLimit(req, { now: now + 60_000 }))!.ok).toBe(true);
  });

  it("reads the client address from proxy headers", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe(
      "198.51.100.1",
    );
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
