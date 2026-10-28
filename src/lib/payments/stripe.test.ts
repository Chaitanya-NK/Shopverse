import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { STRIPE_API_URL: "https://api.stripe.com" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const {
  encodeForm,
  fromPaise,
  keyMode,
  signWebhook,
  STRIPE_SECRET_KEY,
  subscriptionPeriod,
  invoiceSubscriptionId,
  toPaise,
  verifyWebhookSignature,
} = await import("@/lib/payments/stripe");

describe("stripe helpers", () => {
  it("converts rupees and paise without float drift", () => {
    expect(toPaise(19999)).toBe(1999900);
    expect(toPaise(10.1)).toBe(1010);
    expect(toPaise(0.29)).toBe(29);
    expect(fromPaise(1999900)).toBe(19999);
  });

  it("encodes nested bodies the way Stripe expects", () => {
    expect(
      decodeURIComponent(
        encodeForm({
          mode: "payment",
          line_items: [{ price_data: { currency: "inr", unit_amount: 49900 }, quantity: 1 }],
          metadata: { order: "a&b=c" },
          skipped: null,
          expand: ["payment_intent"],
        }),
      ),
    ).toBe(
      "mode=payment&line_items[0][price_data][currency]=inr&line_items[0][price_data][unit_amount]=49900&line_items[0][quantity]=1&metadata[order]=a&b=c&expand[0]=payment_intent",
    );
    // Values are escaped, so "&" and "=" can't break the body.
    expect(encodeForm({ metadata: { order: "a&b=c" } })).toBe("metadata%5Border%5D=a%26b%3Dc");
  });

  it("accepts secret and restricted keys and tells test from live", () => {
    expect(STRIPE_SECRET_KEY.test("sk_test_51AbCdEfGhIjKlMn")).toBe(true);
    expect(STRIPE_SECRET_KEY.test("rk_live_51AbCdEfGhIjKlMn")).toBe(true);
    expect(STRIPE_SECRET_KEY.test("pk_test_51AbCdEfGhIjKlMn")).toBe(false);
    expect(keyMode("sk_live_x")).toBe("live");
    expect(keyMode("sk_test_x")).toBe("test");
  });

  it("verifies webhook signatures over timestamp.body and rejects replays", () => {
    const body = '{"id":"evt_1","type":"checkout.session.completed"}';
    const now = 1_800_000_000_000;
    const header = signWebhook("whsec_abc", body, now / 1000);
    expect(verifyWebhookSignature("whsec_abc", body, header, { now })).toBe(true);
    expect(verifyWebhookSignature("whsec_other", body, header, { now })).toBe(false);
    expect(verifyWebhookSignature("whsec_abc", body + " ", header, { now })).toBe(false);
    // Ten minutes later the same request is refused.
    expect(verifyWebhookSignature("whsec_abc", body, header, { now: now + 600_000 })).toBe(false);
    // Any one of several v1 signatures may match (secret rotation).
    expect(
      verifyWebhookSignature("whsec_abc", body, `${header},v1=${"0".repeat(64)}`, { now }),
    ).toBe(true);
    expect(verifyWebhookSignature("whsec_abc", body, "garbage", { now })).toBe(false);
  });

  it("reads the period and invoice subscription in old and new API shapes", () => {
    const base = {
      id: "sub_1",
      object: "subscription" as const,
      status: "active" as const,
      customer: "cus_1",
      cancel_at_period_end: false,
      schedule: null,
      metadata: null,
      latest_invoice: null,
    };
    expect(
      subscriptionPeriod({
        ...base,
        items: {
          data: [{ id: "si", price: { id: "p" }, current_period_start: 1, current_period_end: 2 }],
        },
      }),
    ).toEqual({ start: 1, end: 2 });
    expect(
      subscriptionPeriod({
        ...base,
        current_period_start: 3,
        current_period_end: 4,
        items: { data: [{ id: "si", price: { id: "p" } }] },
      }),
    ).toEqual({ start: 3, end: 4 });
    const invoice = {
      id: "in",
      status: "paid",
      amount_paid: 1,
      amount_due: 1,
      hosted_invoice_url: null,
    };
    expect(invoiceSubscriptionId({ ...invoice, subscription: "sub_old" })).toBe("sub_old");
    expect(
      invoiceSubscriptionId({
        ...invoice,
        parent: { subscription_details: { subscription: "sub_new" } },
      }),
    ).toBe("sub_new");
  });
});
