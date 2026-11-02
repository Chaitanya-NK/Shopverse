import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { STRIPE_JS_URL: "https://js.stripe.com/basil/stripe.js" } }));

import type { StripeCheckoutSession } from "./stripe";
import { paymentStart } from "./start-server";

const session = (fields: Partial<StripeCheckoutSession>) =>
  ({ id: "cs_test_1", url: null, client_secret: null, ...fields }) as StripeCheckoutSession;

describe("paymentStart", () => {
  it("pays on our own page when there's a publishable key", () => {
    expect(paymentStart(session({ client_secret: "cs_test_1_secret_x" }), "pk_test_abc")).toEqual({
      kind: "elements",
      clientSecret: "cs_test_1_secret_x",
      publishableKey: "pk_test_abc",
      stripeJsUrl: "https://js.stripe.com/basil/stripe.js",
      billingAddress: null,
    });
  });

  it("falls back to Stripe's page without one", () => {
    expect(paymentStart(session({ url: "https://checkout.stripe.com/c/pay/1" }), null)).toEqual({
      kind: "redirect",
      url: "https://checkout.stripe.com/c/pay/1",
    });
  });

  it("refuses a session that can't be paid", () => {
    expect(() => paymentStart(session({}), "pk_test_abc")).toThrow();
    expect(() => paymentStart(session({}), null)).toThrow();
  });
});
