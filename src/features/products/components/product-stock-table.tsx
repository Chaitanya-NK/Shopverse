import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type ProductStockRow } from "@/features/products/queries";
import { formatNumber } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Stock for each variant in each warehouse. */
export function ProductStockTable({
  rows,
  showExpiry,
}: {
  rows: ProductStockRow[];
  showExpiry: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Variant</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead className="text-right">On hand</TableHead>
            <TableHead className="text-right">Reserved</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead className="text-right">Reorder at</TableHead>
            {showExpiry && <TableHead className="pr-4">Next expiry</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.variantId}-${row.warehouseId}`}>
              <TableCell className="pl-4">
                <span className="font-medium">{row.variantTitle}</span>
                <span className="block font-mono text-xs text-muted-foreground">{row.sku}</span>
              </TableCell>
              <TableCell>{row.warehouseName}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(row.onHand)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatNumber(row.reserved)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(row.available)}
                {row.isLow && (
                  <Badge
                    variant="secondary"
                    className="ml-2 border-transparent bg-warning text-warning-foreground"
                  >
                    Low
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatNumber(row.reorderPoint)}
              </TableCell>
              {showExpiry && (
                <TableCell className="pr-4">
                  {row.nextExpiry ? dateFormat.format(new Date(row.nextExpiry)) : "—"}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
