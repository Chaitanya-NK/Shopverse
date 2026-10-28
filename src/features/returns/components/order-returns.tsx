import { FileTextIcon, Undo2Icon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/routes";
import { ReturnStatusBadge } from "@/features/returns/components/return-status-badge";
import { WithdrawReturnButton } from "@/features/returns/components/withdraw-return-button";
import { type OrderReturn, type RefundMethod } from "@/features/returns/schemas";
import { formatMoney } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const REFUND_HOW: Record<RefundMethod, string> = {
  original: "to your original payment method",
  upi: "by UPI",
  bank: "to your bank account",
  cash: "in cash",
};

function message(r: OrderReturn, money: (n: number) => string) {
  const exchange = r.resolution === "exchange";
  switch (r.status) {
    case "requested":
      return "We'll review your request soon.";
    case "approved":
      return "Approved. Keep the items packed, with tags, ready for pickup.";
    case "picked_up":
      return "Picked up. We'll check the items when they arrive.";
    case "received":
      if (exchange) return "Received. Your replacement is being prepared.";
      if (r.refund_status === "processing" || r.refund_status === "due")
        return `Received. Your refund of ${money(r.refund_amount)} is being processed.`;
      return "Received.";
    case "completed":
      if (exchange) return "Exchanged. Your replacement order is on its way.";
      if (r.refund_status === "refunded")
        return `Refunded ${money(r.refunded_amount)}${r.refund_method ? ` ${REFUND_HOW[r.refund_method]}` : ""}.${r.refund_method === "cash" ? "" : " Banks can take 5–7 working days."}`;
      return r.source === "rto" ? "The parcel came back to us. Nothing to pay." : "Closed.";
    case "rejected":
      return "We couldn't accept this return.";
    case "cancelled":
      return "You withdrew this request.";
  }
}

/** Returns on the shopper's order page, newest last. */
export function OrderReturns({
  returns,
  currency,
  shopSlug,
  orderToken,
  owner,
}: {
  returns: OrderReturn[];
  currency: string;
  shopSlug: string;
  orderToken: string;
  owner: boolean;
}) {
  if (returns.length === 0) return null;
  const money = (n: number) => formatMoney(n, currency);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Undo2Icon className="size-5" aria-hidden />
          Returns
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {returns.map((r) => (
          <section
            key={r.id}
            className="space-y-2 rounded-lg border p-3 text-sm"
            aria-label={`Return ${r.number}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="font-mono font-medium">{r.number}</span>
                <ReturnStatusBadge status={r.status} />
              </span>
              <span className="text-muted-foreground">
                {r.resolution === "exchange" ? "Exchange" : "Refund"} ·{" "}
                {dateFormat.format(new Date(r.created_at))}
              </span>
            </div>
            <ul className="text-muted-foreground">
              {r.items.map((i, n) => (
                <li key={n}>
                  {i.quantity} × {i.title}
                  {i.exchange_for && ` → ${i.exchange_for}`}
                </li>
              ))}
            </ul>
            <p>{message(r, money)}</p>
            {r.staff_note && (r.status === "rejected" || r.status === "approved") && (
              <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">{r.staff_note}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {r.credit_note_number && (
                <Button asChild variant="outline" size="sm">
                  <Link href={routes.storefrontCreditNote(shopSlug, orderToken, r.id)}>
                    <FileTextIcon />
                    Credit note {r.credit_note_number}
                  </Link>
                </Button>
              )}
              {r.exchange_order_token && (
                <Button asChild variant="outline" size="sm">
                  <Link href={routes.storefrontOrder(shopSlug, r.exchange_order_token)}>
                    Replacement order
                  </Link>
                </Button>
              )}
              {owner && (r.status === "requested" || r.status === "approved") && (
                <WithdrawReturnButton
                  shopSlug={shopSlug}
                  orderToken={orderToken}
                  returnId={r.id}
                  number={r.number}
                />
              )}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
