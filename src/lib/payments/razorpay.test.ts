import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { RAZORPAY_API_URL: "https://api.razorpay.com" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { fromPaise, toPaise, verifyPaymentSignature, verifyWebhookSignature } =
  await import("@/lib/payments/razorpay");

describe("razorpay helpers", () => {
  it("converts rupees and paise without float drift", () => {
    expect(toPaise(19999)).toBe(1999900);
    expect(toPaise(10.1)).toBe(1010);
    expect(toPaise(0.29)).toBe(29);
    expect(fromPaise(1999900)).toBe(19999);
  });

  it("verifies the checkout signature over order_id|payment_id with the key secret", () => {
    const signature = createHmac("sha256", "key_secret").update("order_1|pay_1").digest("hex");
    expect(
      verifyPaymentSignature("key_secret", { orderId: "order_1", paymentId: "pay_1", signature }),
    ).toBe(true);
    expect(
      verifyPaymentSignature("key_secret", { orderId: "order_1", paymentId: "pay_2", signature }),
    ).toBe(false);
    expect(
      verifyPaymentSignature("other", { orderId: "order_1", paymentId: "pay_1", signature }),
    ).toBe(false);
    expect(
      verifyPaymentSignature("key_secret", {
        orderId: "order_1",
        paymentId: "pay_1",
        signature: "short",
      }),
    ).toBe(false);
  });

  it("verifies webhooks over the raw body with the webhook secret", () => {
    const body = '{"event":"payment.captured","payload":{}}';
    const signature = createHmac("sha256", "hook").update(body).digest("hex");
    expect(verifyWebhookSignature("hook", body, signature)).toBe(true);
    // Re-serialised JSON (different spacing) must not pass.
    expect(
      verifyWebhookSignature("hook", JSON.stringify(JSON.parse(body), null, 1), signature),
    ).toBe(false);
  });
});
