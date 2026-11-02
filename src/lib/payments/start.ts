/**
 * How a payment continues once the server has created the Checkout Session:
 * on Shopverse's own page with Stripe's payment fields ("elements"), or on
 * Stripe's hosted page when no publishable key is set up ("redirect").
 */
export type PaymentStart =
  | { kind: "redirect"; url: string }
  | {
      kind: "elements";
      clientSecret: string;
      publishableKey: string;
      stripeJsUrl: string;
      /** Sent with the payment: Indian accounts need the payer's name and address. */
      billingAddress: BillingAddress | null;
    };

/** Stripe.js's billing address shape. */
export type BillingAddress = {
  name: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    /** ISO 3166-1 alpha-2, e.g. "IN". */
    country: string;
  };
};

/**
 * A Stripe billing address from what we know, or null unless there's a name,
 * street, city and PIN code (Stripe's fields then ask for them instead).
 */
export function billingAddress(input: {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): BillingAddress | null {
  const name = input.name?.trim();
  const clean = (v?: string | null) => v?.trim() || undefined;
  if (!name || !clean(input.line1) || !clean(input.city) || !clean(input.postalCode)) return null;
  return {
    name,
    address: {
      line1: clean(input.line1),
      line2: clean(input.line2),
      city: clean(input.city),
      state: clean(input.state),
      postal_code: clean(input.postalCode),
      country: clean(input.country)?.toUpperCase() ?? "IN",
    },
  };
}
