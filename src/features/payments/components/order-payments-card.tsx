import { CreditCardIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RetryRefundsButton } from "@/features/payments/components/retry-refunds-button";
import { type OrderPayment } from "@/features/payments/queries";
import { PAYMENT_STATUS_COPY } from "@/features/payments/schemas";
import { formatMoney } from "@/lib/format";

const time = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const STATUS_VARIANT = {
  created: "outline",
  captured: "default",
  failed: "destructive",
  refunded: "secondary",
  partially_refunded: "secondary",
} as const;

/** Online payment attempts for an order, and any refund still owed. */
export function OrderPaymentsCard({
  organizationSlug,
  orderId,
  orderCancelled,
  paymentDueAt,
  payments,
}: {
  organizationSlug: string;
  orderId: string;
  orderCancelled: boolean;
  paymentDueAt: string | null;
  payments: OrderPayment[];
}) {
  const owed = payments.some(
    (p) =>
      (p.status === "captured" || p.status === "partially_refunded") &&
      p.amount > p.refundedAmount &&
      (orderCancelled || p.refundDue),
  );
  // An attempt that never finished, once another succeeded or the order closed.
  const settled = payments.some((p) => p.status !== "created" && p.status !== "failed");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCardIcon className="size-5" aria-hidden />
          Online payments
        </CardTitle>
        {paymentDueAt && (
          <CardDescription>
            Waiting for the customer to pay. Stock is held until{" "}
            {time.format(new Date(paymentDueAt))}, then the order is cancelled automatically.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment attempts yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium tabular-nums">
                    {formatMoney(p.amount, p.currency)}
                    <Badge variant={STATUS_VARIANT[p.status]}>
                      {p.status === "created" && (settled || paymentDueAt === null)
                        ? "Not completed"
                        : PAYMENT_STATUS_COPY[p.status]}
                    </Badge>
                    {p.method && (
                      <span className="text-xs text-muted-foreground uppercase">{p.method}</span>
                    )}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {p.providerPaymentId ?? p.providerOrderId}
                  </p>
                  {p.error && <p className="text-xs text-destructive">{p.error}</p>}
                  {p.refundedAmount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Refunded {formatMoney(p.refundedAmount, p.currency)}
                    </p>
                  )}
                  {p.refundDue && p.amount > p.refundedAmount && (
                    <p className="text-xs text-warning-foreground">Extra payment: refund owed</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {time.format(new Date(p.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {owed && <RetryRefundsButton organizationSlug={organizationSlug} orderId={orderId} />}
      </CardContent>
    </Card>
  );
}
