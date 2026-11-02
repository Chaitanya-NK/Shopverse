import "server-only";

import { env } from "@/env";
import { AppError } from "@/lib/errors";
import type { StripeCheckoutSession } from "@/lib/payments/stripe";
import type { BillingAddress, PaymentStart } from "@/lib/payments/start";

export type { PaymentStart };

/** What the browser needs next for a Checkout Session we just created. */
export function paymentStart(
  session: StripeCheckoutSession,
  publishableKey: string | null | undefined,
  billingAddress: BillingAddress | null = null,
): PaymentStart {
  if (publishableKey) {
    if (!session.client_secret)
      throw new AppError("UNAVAILABLE", "Stripe didn't return the payment details.");
    return {
      kind: "elements",
      clientSecret: session.client_secret,
      publishableKey,
      stripeJsUrl: env.STRIPE_JS_URL,
      billingAddress,
    };
  }
  if (!session.url) throw new AppError("UNAVAILABLE", "Stripe didn't return a payment page.");
  return { kind: "redirect", url: session.url };
}
