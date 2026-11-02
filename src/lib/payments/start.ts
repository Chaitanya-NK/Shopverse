/**
 * How a payment continues once the server has created the Checkout Session:
 * on Shopverse's own page with Stripe's payment fields ("elements"), or on
 * Stripe's hosted page when no publishable key is set up ("redirect").
 */
export type PaymentStart =
  | { kind: "redirect"; url: string }
  | { kind: "elements"; clientSecret: string; publishableKey: string; stripeJsUrl: string };
