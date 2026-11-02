"use client";

import { LockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { reportClientError } from "@/lib/observability/report";
import type { PaymentStart } from "@/lib/payments/start";
import {
  appearanceFrom,
  confirmCheckout,
  initCheckout,
  loadStripeJs,
  type StripeCheckout,
} from "@/lib/payments/stripe-browser";

type Prepared = {
  checkout: StripeCheckout;
  element: { mount(target: HTMLElement): void };
  mountedOn: HTMLElement | null;
};

/**
 * Stripe's checkout for a session, set up once per client secret: Stripe
 * doesn't allow initialising the same session twice, which React's
 * development mode (effects run twice) would otherwise do.
 */
const prepared = new Map<string, Promise<Prepared>>();
function prepare(
  start: Extract<PaymentStart, { kind: "elements" }>,
  form: HTMLElement,
): Promise<Prepared> {
  let entry = prepared.get(start.clientSecret);
  if (!entry) {
    entry = (async () => {
      const Stripe = await loadStripeJs(start.stripeJsUrl);
      const stripe = Stripe(start.publishableKey, { locale: "auto" });
      const checkout = await initCheckout(stripe, start.clientSecret, appearanceFrom(form));
      return { checkout, element: checkout.createPaymentElement(), mountedOn: null };
    })();
    // A failure may be temporary: let a later try start again.
    entry.catch(() => prepared.delete(start.clientSecret));
    prepared.set(start.clientSecret, entry);
  }
  return entry;
}

/** Stripe's own explanation, when it gave one. */
function stripeMessage(error: unknown): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : null;
  return message && message !== "Stripe.js didn't load" ? message : null;
}

export type PaymentFormLabels = {
  pay: string;
  secure: string;
  unavailable: string;
  failed: string;
};

/**
 * Stripe's payment fields (card, UPI and whatever else the Stripe account
 * offers) inside our own page, styled from the page's design tokens, with our
 * own Pay button. Card details go straight from Stripe's fields to Stripe;
 * they never touch Shopverse. After paying, Stripe sends the browser to the
 * session's return URL, where the payment is confirmed on the server.
 */
export function StripePaymentForm({
  start,
  labels,
}: {
  start: Extract<PaymentStart, { kind: "elements" }>;
  labels: PaymentFormLabels;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<StripeCheckout | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "paying" | "broken">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void prepare(start, formRef.current!)
      .then((prepared) => {
        if (cancelled) return;
        // Mount once; React's development double-run finds it already there.
        if (prepared.mountedOn !== fieldsRef.current) {
          prepared.element.mount(fieldsRef.current!);
          prepared.mountedOn = fieldsRef.current;
        }
        checkoutRef.current = prepared.checkout;
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Keep the real reason for whoever investigates (console and /admin/errors).
        console.error("Stripe payment fields failed to load:", error);
        reportClientError(error, "rejection");
        setState("broken");
        const reason = stripeMessage(error);
        setMessage(reason ? `${labels.unavailable} (${reason})` : labels.unavailable);
      });
    return () => {
      cancelled = true;
    };
  }, [start, labels.unavailable]);

  const pay = async (event: React.FormEvent) => {
    event.preventDefault();
    const checkout = checkoutRef.current;
    if (!checkout || state !== "ready") return;
    setState("paying");
    setMessage(null);
    try {
      const result = await confirmCheckout(checkout);
      // Success leaves the page for the return URL; stay busy until then.
      if (result.type === "error") {
        setMessage(result.error.message || labels.failed);
        setState("ready");
      }
    } catch {
      setMessage(labels.failed);
      setState("ready");
    }
  };

  return (
    <form ref={formRef} onSubmit={pay} className="space-y-4" aria-busy={state === "loading"}>
      {state === "loading" && (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-2/3" />
        </div>
      )}
      <div ref={fieldsRef} data-testid="payment-fields" />
      {message && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={state !== "ready"}
        aria-disabled={state !== "ready"}
      >
        {state === "paying" || state === "loading" ? <Spinner /> : <LockIcon />}
        {labels.pay}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="size-3" aria-hidden />
        {labels.secure}
      </p>
    </form>
  );
}
