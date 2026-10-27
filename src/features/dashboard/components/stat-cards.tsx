import { AlertTriangleIcon, PackageCheckIcon, ShoppingBagIcon, TruckIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type OverviewStats } from "@/features/dashboard/queries";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCards({ stats, currency }: { stats: OverviewStats; currency: string }) {
  const cards = [
    {
      label: "Sales · last 24h",
      value: formatMoney(stats.revenue_24h, currency),
      hint: `${formatNumber(stats.orders_24h)} orders`,
      icon: ShoppingBagIcon,
    },
    {
      label: "Orders to fulfil",
      value: formatNumber(stats.orders_to_fulfil),
      hint: "Confirmed, not yet shipped",
      icon: PackageCheckIcon,
    },
    {
      label: "In transit",
      value: formatNumber(stats.shipments_in_transit),
      hint: "Picked up or out for delivery",
      icon: TruckIcon,
    },
    {
      label: "Low-stock SKUs",
      value: formatNumber(stats.low_stock_skus),
      hint: "At or below reorder point",
      icon: AlertTriangleIcon,
      tone: stats.low_stock_skus > 0 ? "warning" : undefined,
    },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="gap-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription>{card.label}</CardDescription>
            <card.icon
              aria-hidden="true"
              className={cn(
                "size-4 text-muted-foreground",
                "tone" in card && card.tone && "text-warning-foreground",
              )}
            />
          </CardHeader>
          <CardContent className="space-y-1">
            <CardTitle className="font-mono text-2xl tabular-nums">{card.value}</CardTitle>
            <p className="text-xs text-muted-foreground">{card.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[118px] rounded-xl" />
      ))}
    </div>
  );
}
