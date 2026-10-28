import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: {} }));

const { decryptSecret, encryptSecret } = await import("@/lib/payments/secrets");

describe("payment secrets", () => {
  const key = randomBytes(32);

  it("round-trips, with a fresh IV each time", () => {
    const a = encryptSecret("sk_test_secret123", key);
    const b = encryptSecret("sk_test_secret123", key);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret(a, key)).toBe("sk_test_secret123");
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = encryptSecret("sk_test_secret123", key);
    const parts = sealed.split(".");
    const tampered = [...parts.slice(0, 3), Buffer.from("x" + parts[3]).toString("base64url")].join(
      ".",
    );
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
  });

  it("explains a missing server key", () => {
    expect(() => encryptSecret("x")).toThrow(/PAYMENTS_ENCRYPTION_KEY/);
  });
});
