"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { StripePaymentForm } from "@/components/shared/stripe-payment-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { startOnlinePayment } from "@/features/payments/actions";
import { useT } from "@/i18n/client";
import type { PaymentStart } from "@/lib/payments/start";

type Elements = Extract<PaymentStart, { kind: "elements" }>;

/**
 * The payment step on the shop's own page. Starts a Checkout Session for the
 * order; shows Stripe's fields here, or (for a business that hasn't added its
 * publishable key) goes on to Stripe's page.
 */
export function ShopPayment({
  shopSlug,
  orderToken,
  payLabel,
}: {
  shopSlug: string;
  orderToken: string;
  payLabel: string;
}) {
  const t = useT();
  const started = useRef(false);
  const [start, setStart] = useState<Elements | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startOnlinePayment({ orderToken }).then((result) => {
      if (!result.ok) setProblem(result.error.message);
      else if (result.data.kind === "redirect") window.location.assign(result.data.url);
      else setStart(result.data);
    });
  }, [orderToken]);

  if (problem)
    return (
      <div className="space-y-4">
        <Alert variant="destructive" role="alert">
          <AlertTitle>{t("We couldn't start the payment")}</AlertTitle>
          <AlertDescription>{t(problem)}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-full">
          <Link href={routes.storefrontOrder(shopSlug, orderToken)}>
            <ArrowLeftIcon />
            {t("Back to your order")}
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
        secure: t("Payments are processed securely by Stripe. We never see your card details."),
        unavailable: t("Online payment isn't available right now. Please contact the shop."),
        failed: t("The payment didn't go through. Please try again."),
      }}
    />
  );
}
