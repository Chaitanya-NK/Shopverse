import Link from "next/link";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routes } from "@/config/routes";
import { ReturnStatusBadge } from "@/features/returns/components/return-status-badge";
import { StartReturnDialog } from "@/features/returns/components/start-return-dialog";
import { getOrderReturnOptions, listOrderReturns } from "@/features/returns/queries";
import { formatMoney } from "@/lib/format";

/** Returns on an order (staff), with a way to start one once anything is delivered. */
export async function OrderReturnsCard({
  organizationSlug,
  orderId,
  currency,
  canManage,
}: {
  organizationSlug: string;
  orderId: string;
  currency: string;
  canManage: boolean;
}) {
  const [returns, options] = await Promise.all([
    listOrderReturns(orderId),
    getOrderReturnOptions(orderId),
  ]);
  const canStart =
    canManage && options.items.some((i) => i.returnable > 0 && i.blocked !== "cancelled");
  if (returns.length === 0 && !canStart) return null;

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Returns</CardTitle>
        {returns.length === 0 && <CardDescription>Nothing returned yet.</CardDescription>}
        {canStart && (
          <CardAction>
            <StartReturnDialog
              organizationSlug={organizationSlug}
              orderId={orderId}
              options={options}
              currency={currency}
            />
          </CardAction>
        )}
      </CardHeader>
      {returns.length > 0 && (
        <CardContent className="space-y-2 text-sm">
          {returns.map((r) => (
            <Link
              key={r.id}
              href={routes.orgReturn(organizationSlug, r.id)}
              className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium">{r.number}</span>
                <ReturnStatusBadge status={r.status} />
              </span>
              <span className="mt-1 block truncate text-muted-foreground">
                {r.itemCount} × {r.itemTitles}
              </span>
              <span className="block text-xs text-muted-foreground">
                {r.resolution === "exchange" ? "Exchange" : "Refund"}
                {r.creditTotal > 0 && ` · credit ${formatMoney(r.creditTotal, currency)}`}
              </span>
            </Link>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
