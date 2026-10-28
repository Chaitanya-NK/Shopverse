"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { confirmOnlinePayment } from "@/features/payments/actions";

/**
 * On the order page after Stripe Checkout (?checkout=<session id> or
 * ?checkout=cancelled): confirm the payment with Stripe once, say what
 * happened, and tidy the address bar.
 */
export function PaymentReturn({
  orderToken,
  checkout,
  path,
}: {
  orderToken: string;
  checkout: string;
  path: string;
}) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const finish = () => {
      router.replace(path, { scroll: false });
      router.refresh();
    };
    if (checkout === "cancelled") {
      toast.info("Payment not completed. Your order is saved; pay before the time runs out.");
      finish();
      return;
    }
    void confirmOnlinePayment({ orderToken, sessionId: checkout }).then((result) => {
      if (!result.ok) toast.error(result.error.message);
      else if (result.data.result === "unpaid")
        toast.info("We're waiting for Stripe to confirm the payment. This page will update.");
      else if (result.data.result === "confirmed" || result.data.result === "already_recorded")
        toast.success("Payment received. Your order is confirmed.");
      else toast.warning("This order was already paid or closed, so the payment will be refunded.");
      finish();
    });
  }, [checkout, orderToken, path, router]);

  return null;
}
