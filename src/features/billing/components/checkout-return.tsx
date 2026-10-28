"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { confirmPlanCheckout } from "@/features/billing/actions";

/** Back on Billing from Stripe Checkout: confirm the plan once, then tidy the URL. */
export function CheckoutReturn({
  organizationSlug,
  checkout,
  path,
}: {
  organizationSlug: string;
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
      toast.info("Checkout cancelled. Your plan hasn't changed.");
      finish();
      return;
    }
    void confirmPlanCheckout({ organizationSlug, checkoutId: checkout }).then((result) => {
      if (!result.ok) toast.error(result.error.message);
      else if (result.data.complete) toast.success("Your plan is active. Thank you!");
      else toast.info("We're waiting for Stripe to confirm the payment. This page will update.");
      finish();
    });
  }, [checkout, organizationSlug, path, router]);

  return null;
}
