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
import { ReturnStatusBadge } from "@/features/returns/components/return-status-badge";
import { type ReturnRow } from "@/features/returns/queries";
import { REFUND_STATUS_LABELS, RETURN_REASON_LABELS } from "@/features/returns/schemas";
import { formatMoney } from "@/lib/format";

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function ReturnsTable({
  organizationSlug,
  rows,
  showShop,
}: {
  organizationSlug: string;
  rows: ReturnRow[];
  showShop: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Return</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="hidden lg:table-cell">Items</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-4 text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="align-top">
              <TableCell className="pl-4">
                <Link
                  href={routes.orgReturn(organizationSlug, r.id)}
                  className="font-mono font-medium hover:underline"
                >
                  {r.number}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  Order{" "}
                  <Link
                    href={routes.orgOrder(organizationSlug, r.orderId)}
                    className="font-mono hover:underline"
                  >
                    {r.orderNumber}
                  </Link>{" "}
                  · {timeFormat.format(new Date(r.createdAt))}
                </span>
                {showShop && (
                  <span className="block text-xs text-muted-foreground">{r.shopName}</span>
                )}
              </TableCell>
              <TableCell className="whitespace-normal">
                <span className="block">{r.customerName ?? "—"}</span>
                <span className="block text-xs text-muted-foreground">
                  {RETURN_REASON_LABELS[r.reason]}
                </span>
              </TableCell>
              <TableCell className="hidden max-w-72 whitespace-normal lg:table-cell">
                <span className="line-clamp-2 text-sm">{r.itemTitles}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.itemCount} item{r.itemCount === 1 ? "" : "s"} ·{" "}
                  {r.resolution === "exchange" ? "exchange" : "refund"}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <ReturnStatusBadge status={r.status} />
                  {r.source === "rto" && <Badge variant="outline">Undelivered</Badge>}
                  {r.refundStatus &&
                    r.refundStatus !== "not_needed" &&
                    r.status !== "completed" && (
                      <Badge
                        variant={r.refundStatus === "failed" ? "destructive" : "secondary"}
                        className={
                          r.refundStatus === "due"
                            ? "border-transparent bg-warning text-warning-foreground"
                            : undefined
                        }
                      >
                        {REFUND_STATUS_LABELS[r.refundStatus]}
                      </Badge>
                    )}
                </div>
              </TableCell>
              <TableCell className="pr-4 text-right font-mono tabular-nums">
                {r.creditTotal > 0 ? formatMoney(r.creditTotal, r.currency) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
