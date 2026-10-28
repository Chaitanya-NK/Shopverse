"use client";

import { useCallback, useState } from "react";

import { env } from "@/env";
import { startOnlinePayment, verifyOnlinePayment } from "@/features/payments/actions";

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: { error?: { description?: string } }) => void,
  ) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Load Razorpay Checkout once per page. */
function loadCheckout(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = env.NEXT_PUBLIC_RAZORPAY_CHECKOUT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export type PaymentOutcome =
  { status: "paid" } | { status: "dismissed" } | { status: "failed"; message: string };

/**
 * Run an online payment for an order awaiting one: create a Razorpay order on
 * the server, open Razorpay Checkout, then verify the result on the server.
 */
export function useRazorpayCheckout() {
  const [busy, setBusy] = useState(false);

  const pay = useCallback(async (orderToken: string): Promise<PaymentOutcome> => {
    setBusy(true);
    try {
      const started = await startOnlinePayment({ orderToken });
      if (!started.ok) return { status: "failed", message: started.error.message };
      await loadCheckout();
      const session = started.data;

      return await new Promise<PaymentOutcome>((resolve) => {
        let settled = false;
        const finish = (outcome: PaymentOutcome) => {
          if (settled) return;
          settled = true;
          resolve(outcome);
        };
        const checkout = new window.Razorpay!({
          key: session.keyId,
          order_id: session.razorpayOrderId,
          amount: session.amountPaise,
          currency: session.currency,
          name: session.shopName,
          description: session.description,
          prefill: session.prefill,
          theme: { color: "#1d6b5c" },
          retry: { enabled: true },
          handler: async (response: RazorpaySuccess) => {
            const verified = await verifyOnlinePayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            finish(
              verified.ok
                ? { status: "paid" }
                : { status: "failed", message: verified.error.message },
            );
          },
          modal: { ondismiss: () => finish({ status: "dismissed" }), confirm_close: true },
        });
        // Razorpay lets the shopper retry inside the window after a failure,
        // so a failed attempt alone doesn't end the flow.
        checkout.open();
      });
    } catch (cause) {
      return {
        status: "failed",
        message: cause instanceof Error ? cause.message : "The payment couldn't be started.",
      };
    } finally {
      setBusy(false);
    }
  }, []);

  return { pay, busy };
}
