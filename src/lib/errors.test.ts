import { describe, expect, it } from "vitest";

import { fromAuthError, fromPostgrestError } from "./errors";

describe("fromPostgrestError", () => {
  it("maps unique violations to a field-level conflict", () => {
    const error = fromPostgrestError({ code: "23505", message: "dup" }, { conflictField: "slug" });
    expect(error.code).toBe("CONFLICT");
    expect(error.fieldErrors?.slug?.[0]).toMatch(/already in use/i);
  });

  it("maps RLS denials to FORBIDDEN", () => {
    expect(fromPostgrestError({ code: "42501", message: "denied" }).code).toBe("FORBIDDEN");
  });

  it("never leaks unknown database messages", () => {
    const error = fromPostgrestError({ code: "XX000", message: "internal detail: table secrets" });
    expect(error.code).toBe("INTERNAL");
    expect(error.message).not.toContain("secrets");
  });
});

describe("fromAuthError", () => {
  it("maps rate limits", () => {
    expect(fromAuthError({ status: 429, message: "slow down" }).code).toBe("RATE_LIMITED");
  });

  it("maps expired codes to the token field", () => {
    const error = fromAuthError({ code: "otp_expired", message: "expired" });
    expect(error.fieldErrors?.token).toBeDefined();
  });
});
