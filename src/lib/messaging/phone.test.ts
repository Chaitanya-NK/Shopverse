import { describe, expect, it } from "vitest";

import { maskPhone, toE164 } from "@/lib/messaging/phone";

describe("phone numbers", () => {
  it("normalises Indian mobiles", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("098765-43210")).toBe("+919876543210");
    expect(toE164("919876543210")).toBe("+919876543210");
    expect(toE164("+91 98765 43210")).toBe("+919876543210");
    expect(toE164("+1 415 523 8886")).toBe("+14155238886");
  });
  it("rejects what can't be a mobile", () => {
    expect(toE164("12345")).toBeNull();
    expect(toE164("0201234567")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
  it("masks for display", () => {
    expect(maskPhone("+919876543210")).toBe("+919876••••10");
  });
});
