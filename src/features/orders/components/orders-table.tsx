import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import {
  FulfillmentBadge,
  OrderStatusBadge,
  PaymentBadge,
} from "@/features/orders/components/status-badges";
import { type OrderListItem } from "@/features/orders/queries";
import { PAYMENT_METHOD_LABELS } from "@/features/orders/schemas";
import { formatMoney } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function OrdersTable({
  organizationSlug,
  orders,
  showShop,
}: {
  organizationSlug: string;
  orders: OrderListItem[];
  showShop: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Payment</TableHead>
            <TableHead className="hidden lg:table-cell">Fulfilment</TableHead>
            <TableHead className="pr-4 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id} className="relative">
              <TableCell className="pl-4">
                <Link
                  href={routes.orgOrder(organizationSlug, o.id)}
                  className="font-mono font-medium after:absolute after:inset-0 hover:underline"
                >
                  {o.number}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {dateFormat.format(new Date(o.placedAt))}
                  {showShop && ` · ${o.shopName}`}
                </span>
              </TableCell>
              <TableCell>
                <span className="block max-w-48 truncate">{o.customerName ?? "Walk-in"}</span>
                <span className="block text-xs text-muted-foreground">
                  {o.city ? `${o.city} · ` : ""}
                  {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                </span>
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={o.status} />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex flex-col items-start gap-1">
                  <PaymentBadge status={o.paymentStatus} />
                  {o.paymentMethod && (
                    <span className="text-xs text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[o.paymentMethod]}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <FulfillmentBadge status={o.fulfillmentStatus} />
              </TableCell>
              <TableCell className="pr-4 text-right font-medium tabular-nums">
                {formatMoney(o.grandTotal, o.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
