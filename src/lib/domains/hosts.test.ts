import { describe, expect, it } from "vitest";

import { customDomainPath, isPlatformHost, requestHost } from "@/lib/domains/hosts";

describe("custom domain hosts", () => {
  const app = "https://app.shopverse.in";
  it("knows the platform's own hosts", () => {
    expect(isPlatformHost("app.shopverse.in", app)).toBe(true);
    expect(isPlatformHost("APP.shopverse.in:443", app)).toBe(true);
    expect(isPlatformHost("localhost:3000", app)).toBe(true);
    expect(isPlatformHost("x-3000.app.github.dev", app)).toBe(true);
    expect(isPlatformHost("x.preview.app", app, "preview.app")).toBe(true);
    expect(isPlatformHost("shop.example.com", app)).toBe(false);
    // A look-alike is not the app.
    expect(isPlatformHost("app.shopverse.in.evil.com", app)).toBe(false);
  });

  it("reads the forwarded host first", () => {
    expect(
      requestHost(new Headers({ host: "a.com", "x-forwarded-host": "Shop.Example.com, a.com" })),
    ).toBe("shop.example.com");
    expect(requestHost(new Headers({ host: "a.com" }))).toBe("a.com");
  });

  it("maps shop paths and leaves platform paths alone", () => {
    expect(customDomainPath("/", "urban")).toBe("/s/urban");
    expect(customDomainPath("/p/tee", "urban")).toBe("/s/urban/p/tee");
    expect(customDomainPath("/s/urban/cart", "urban")).toBeNull();
    expect(customDomainPath("/_next/static/x.js", "urban")).toBeNull();
    expect(customDomainPath("/api/webhooks/x", "urban")).toBeNull();
  });
});
