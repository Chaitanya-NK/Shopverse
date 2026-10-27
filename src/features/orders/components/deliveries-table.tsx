import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { ShipmentActions } from "@/features/orders/components/shipment-actions";
import { ShipmentStatusBadge } from "@/features/orders/components/status-badges";
import { type DeliveryRow } from "@/features/orders/queries";
import { formatMoney } from "@/lib/format";

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function DeliveriesTable({
  organizationSlug,
  rows,
  shopNames,
  canManage,
}: {
  organizationSlug: string;
  rows: DeliveryRow[];
  shopNames: Record<string, string>;
  canManage: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Shipment</TableHead>
            <TableHead>Deliver to</TableHead>
            <TableHead className="hidden md:table-cell">From</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id} className="align-top">
              <TableCell className="pl-4">
                <Link
                  href={routes.orgOrder(organizationSlug, s.orderId)}
                  className="font-mono font-medium hover:underline"
                >
                  {s.number}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {s.itemCount} item{s.itemCount === 1 ? "" : "s"} ·{" "}
                  {timeFormat.format(new Date(s.updatedAt))}
                </span>
                {(s.carrier || s.trackingNumber) && (
                  <span className="block text-xs text-muted-foreground">
                    {s.carrier} <span className="font-mono">{s.trackingNumber}</span>
                  </span>
                )}
              </TableCell>
              <TableCell className="whitespace-normal">
                <span className="block">{s.recipientName}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.city}
                  {s.recipientPhone && ` · ${s.recipientPhone}`}
                </span>
                {s.codDue !== null && (
                  <Badge
                    variant="secondary"
                    className="mt-1 border-transparent bg-warning text-warning-foreground"
                  >
                    Collect {formatMoney(s.codDue, s.currency)}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">{s.warehouseName}</TableCell>
              <TableCell>
                <ShipmentStatusBadge status={s.status} />
              </TableCell>
              <TableCell className="pr-4">
                {canManage && (
                  <ShipmentActions
                    organizationSlug={organizationSlug}
                    shipment={{
                      id: s.id,
                      number: s.number,
                      status: s.status,
                      trackingToken: s.trackingToken,
                      shopName: shopNames[s.shopId] ?? "",
                      orderNumber: s.orderNumber,
                      recipientPhone: s.recipientPhone,
                    }}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
