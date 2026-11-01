import { describe, expect, it } from "vitest";

import { messageBody } from "@/features/messaging/templates";

const c = {
  shopName: "Urban Threads",
  customerName: "Asha Rao",
  orderNumber: "ORD-000001",
  total: "₹547",
  orderUrl: "https://x/o",
  trackingUrl: "https://x/t",
};

describe("message templates", () => {
  it("greets by first name and links the order", () => {
    expect(messageBody("confirmed", c)).toBe(
      "Hi Asha, your Urban Threads order ORD-000001 (₹547) is confirmed. Details: https://x/o",
    );
    expect(messageBody("shipped", { ...c, customerName: null })).toBe(
      "your Urban Threads order ORD-000001 is on its way. Track it: https://x/t",
    );
  });
  it("only sends the delivery update with its code", () => {
    expect(messageBody("out_for_delivery", c)).toBeNull();
    expect(messageBody("out_for_delivery", { ...c, otp: "123456" })).toContain(
      "Delivery code: 123456",
    );
  });
  it("keeps every message short enough for one WhatsApp bubble", () => {
    for (const e of ["confirmed", "shipped", "delivery_failed", "delivered", "cancelled"] as const)
      expect(messageBody(e, c)!.length).toBeLessThan(320);
  });
});
