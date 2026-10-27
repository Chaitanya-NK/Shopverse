import { describe, expect, it } from "vitest";

import { signInSchema, signUpSchema, verifyOtpSchema } from "./schemas";

describe("auth schemas", () => {
  it("normalises email case and whitespace", () => {
    expect(signInSchema.parse({ email: "  Priya@UrbanThreads.IN " }).email).toBe(
      "priya@urbanthreads.in",
    );
  });

  it("rejects malformed emails", () => {
    expect(signInSchema.safeParse({ email: "priya@" }).success).toBe(false);
  });

  it("requires a real name on sign-up", () => {
    expect(signUpSchema.safeParse({ fullName: "P", email: "p@x.in" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Priya Sharma", email: "p@x.in" }).success).toBe(
      true,
    );
  });

  it.each(["123456", " 654321 "])("accepts 6-digit code %j", (token) => {
    expect(verifyOtpSchema.safeParse({ token }).success).toBe(true);
  });

  it.each(["12345", "1234567", "12a456", ""])("rejects code %j", (token) => {
    expect(verifyOtpSchema.safeParse({ token }).success).toBe(false);
  });
});
