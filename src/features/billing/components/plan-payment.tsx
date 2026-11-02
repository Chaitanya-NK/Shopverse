"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { StripePaymentForm } from "@/components/shared/stripe-payment-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import type { BillingInterval, PaidPlanId } from "@/config/plans";
import { startPlanCheckout } from "@/features/billing/actions";
import type { PaymentStart } from "@/lib/payments/start";

type Elements = Extract<PaymentStart, { kind: "elements" }>;

/** Paying for a first plan on Shopverse's own page (Stripe's fields inside). */
export function PlanPayment({
  organizationSlug,
  plan,
  interval,
  payLabel,
}: {
  organizationSlug: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  payLabel: string;
}) {
  const started = useRef(false);
  const [start, setStart] = useState<Elements | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startPlanCheckout({ organizationSlug, plan, interval }).then((result) => {
      if (!result.ok) setProblem(result.error.message);
      else if (result.data.kind === "redirect") window.location.assign(result.data.url);
      else setStart(result.data);
    });
  }, [organizationSlug, plan, interval]);

  if (problem)
    return (
      <div className="space-y-4">
        <Alert variant="destructive" role="alert">
          <AlertTitle>We couldn&apos;t start the payment</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href={routes.orgBilling(organizationSlug)}>
            <ArrowLeftIcon />
            Back to billing
          </Link>
        </Button>
      </div>
    );

  if (!start)
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );

  return (
    <StripePaymentForm
      start={start}
      labels={{
        pay: payLabel,
        payAmount: (amount) => `Pay ${amount} and subscribe`,
        secure:
          "Payments are processed securely by Stripe. Shopverse never sees your card details.",
        unavailable: "Online payment isn't available right now. Please try again later.",
        failed: "The payment didn't go through. Please try again.",
      }}
    />
  );
}
