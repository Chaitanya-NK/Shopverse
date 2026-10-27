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
import { TrackingBadge } from "@/features/catalog/components/tracking-badge";
import { ProductStatusBadge } from "@/features/products/components/product-status-badge";
import { type ProductListItem } from "@/features/products/queries";
import { routes } from "@/config/routes";
import { formatMoney, formatNumber } from "@/lib/format";

function priceRange(min: number | null, max: number | null, currency: string) {
  if (min === null) return "—";
  if (max === null || min === max) return formatMoney(min, currency);
  return `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
}

export function ProductsTable({
  organizationSlug,
  products,
  currency,
}: {
  organizationSlug: string;
  products: ProductListItem[];
  currency: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Product</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Tracking</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Price</TableHead>
            <TableHead className="pr-4 text-right">Available</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id} className="relative">
              <TableCell className="max-w-0 pl-4 sm:max-w-none">
                <Link
                  href={routes.orgProduct(organizationSlug, p.id)}
                  className="font-medium after:absolute after:inset-0 hover:underline"
                >
                  <span className="block truncate">{p.title}</span>
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.categoryName ?? "Uncategorised"} · {p.variantCount} variant
                  {p.variantCount === 1 ? "" : "s"}
                </span>
              </TableCell>
              <TableCell>
                <ProductStatusBadge status={p.status} />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <TrackingBadge tracking={p.tracking} />
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {priceRange(p.minPrice, p.maxPrice, currency)}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <span className="tabular-nums">{formatNumber(p.available)}</span>
                {p.lowStockLocations > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 border-transparent bg-warning text-warning-foreground"
                  >
                    Low
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
