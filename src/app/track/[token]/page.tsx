import { CheckIcon, MapPinIcon, PackageIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/shared/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTracking, TRACKING_STEPS } from "@/features/orders/tracking";
import { SHIPMENT_STATUS_LABELS, shipmentEventText } from "@/features/orders/schemas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Track your parcel",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const dayFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
});

export default function TrackingPage({ params }: PageProps<"/track/[token]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-[32rem] rounded-xl" />}>
        <Tracking params={params} />
      </Suspense>
      <footer className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        Powered by <Logo className="text-xs" />
      </footer>
    </main>
  );
}

async function Tracking({ params }: Pick<PageProps<"/track/[token]">, "params">) {
  const { token } = await params;
  const parcel = await getTracking(token);
  if (!parcel) notFound();

  const currentStep = TRACKING_STEPS.findIndex((s) => s.statuses.includes(parcel.status));
  const problem = parcel.status === "returned_to_origin" || parcel.status === "cancelled";

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {parcel.shopName} · order <span className="font-mono">{parcel.orderNumber}</span>
        </CardDescription>
        <CardTitle className="text-2xl">
          {parcel.status === "delivered"
            ? "Delivered"
            : parcel.status === "failed_attempt"
              ? "We missed you"
              : SHIPMENT_STATUS_LABELS[parcel.status]}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {parcel.status === "delivered" && parcel.deliveredAt
            ? `on ${dayFormat.format(new Date(parcel.deliveredAt))}`
            : parcel.status === "out_for_delivery"
              ? "Keep your 6-digit delivery code handy. Share it only when you have the parcel."
              : parcel.status === "failed_attempt"
                ? "The courier will try again. Keep your delivery code handy."
                : parcel.estimatedDelivery && !problem
                  ? `Expected by ${dayFormat.format(new Date(parcel.estimatedDelivery))}`
                  : null}
          {parcel.destination && (
            <span className="mt-1 flex items-center gap-1">
              <MapPinIcon className="size-3.5" aria-hidden />
              To {parcel.destination}
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        {!problem && (
          <ol className="grid grid-cols-4 gap-2" aria-label="Delivery progress">
            {TRACKING_STEPS.map((step, i) => {
              const done = i <= currentStep;
              return (
                <li
                  key={step.label}
                  className="space-y-2"
                  aria-current={i === currentStep ? "step" : undefined}
                >
                  <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : "bg-muted")} />
                  <p
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      done ? "font-medium" : "text-muted-foreground",
                    )}
                  >
                    {done && i < currentStep && <CheckIcon className="size-3" aria-hidden />}
                    {step.label}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        <section aria-labelledby="parcel-items" className="space-y-2">
          <h2 id="parcel-items" className="flex items-center gap-2 text-sm font-medium">
            <PackageIcon className="size-4" aria-hidden />
            In this parcel
          </h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {parcel.items.map((item) => (
              <li key={item.title}>
                {item.quantity} × {item.title}
              </li>
            ))}
          </ul>
          {(parcel.carrier || parcel.trackingNumber) && (
            <p className="text-xs text-muted-foreground">
              {parcel.carrier}{" "}
              {parcel.trackingNumber && <span className="font-mono">{parcel.trackingNumber}</span>}
            </p>
          )}
        </section>

        <section aria-labelledby="parcel-history" className="space-y-3">
          <h2 id="parcel-history" className="text-sm font-medium">
            History
          </h2>
          <ol className="relative space-y-4 border-l pl-5 text-sm">
            {parcel.events.map((e, i) => (
              <li key={`${e.occurredAt}-${i}`} className="relative">
                <span
                  className={cn(
                    "absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card",
                    i === 0 ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                  aria-hidden
                />
                <p className={i === 0 ? "font-medium" : undefined}>
                  {shipmentEventText(e.status, e.description)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {timeFormat.format(new Date(e.occurredAt))}
                  {e.location && ` · ${e.location}`}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </CardContent>
    </Card>
  );
}
