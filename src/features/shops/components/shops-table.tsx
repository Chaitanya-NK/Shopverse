import { ExternalLinkIcon, Settings2Icon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { ShopStatusBadge } from "@/features/shops/components/shop-status-badge";
import { type ShopSummary } from "@/features/shops/queries";
import { initials } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ShopsTable({
  shops,
  organizationSlug,
  canManage = false,
}: {
  shops: ShopSummary[];
  organizationSlug?: string;
  canManage?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Shop</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="hidden md:table-cell">Domain</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Created</TableHead>
            <TableHead className="w-24 pr-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shops.map((shop) => (
            <TableRow key={shop.id}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground">
                    {initials(shop.name)}
                  </span>
                  <div className="grid">
                    <span className="font-medium">{shop.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{shop.slug}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <ShopStatusBadge status={shop.status} />
              </TableCell>
              <TableCell className="font-mono">{shop.currency}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {shop.customDomain ?? "Not connected"}
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                {dateFormat.format(new Date(shop.createdAt))}
              </TableCell>
              <TableCell className="pr-4">
                <div className="flex justify-end gap-1">
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    aria-label={`Open ${shop.name} storefront`}
                  >
                    <Link href={routes.storefront(shop.slug)} target="_blank">
                      <ExternalLinkIcon />
                    </Link>
                  </Button>
                  {canManage && organizationSlug && (
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      aria-label={`${shop.name} settings`}
                    >
                      <Link href={routes.orgShop(organizationSlug, shop.id)}>
                        <Settings2Icon />
                      </Link>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
