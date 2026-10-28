"use client";

import { useCallback, useState } from "react";

import { startOnlinePayment } from "@/features/payments/actions";

export type PaymentOutcome = { status: "redirecting" } | { status: "failed"; message: string };

/**
 * Take an online payment for an order awaiting one: the server creates a
 * Stripe Checkout Session and the shopper goes to Stripe's payment page. They
 * come back to the order page, which confirms the payment with Stripe.
 */
export function useOnlineCheckout() {
  const [busy, setBusy] = useState(false);

  const pay = useCallback(async (orderToken: string): Promise<PaymentOutcome> => {
    setBusy(true);
    try {
      const started = await startOnlinePayment({ orderToken });
      if (!started.ok) {
        setBusy(false);
        return { status: "failed", message: started.error.message };
      }
      window.location.assign(started.data.url);
      // Stay busy while the browser leaves the page.
      return { status: "redirecting" };
    } catch (cause) {
      setBusy(false);
      return {
        status: "failed",
        message: cause instanceof Error ? cause.message : "The payment couldn't be started.",
      };
    }
  }, []);

  return { pay, busy };
}
