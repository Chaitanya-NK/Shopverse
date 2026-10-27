import { AlertTriangleIcon, PackageCheckIcon, ShoppingBagIcon, TruckIcon } from "lucide-react";

import { type Stat, StatGrid, StatGridSkeleton } from "@/components/shared/stat-card";
import { type OverviewStats } from "@/features/dashboard/queries";
import { formatMoney, formatNumber } from "@/lib/format";

export function StatCards({ stats, currency }: { stats: OverviewStats; currency: string }) {
  const cards: Stat[] = [
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
  ];

  return <StatGrid stats={cards} />;
}

export function StatCardsSkeleton() {
  return <StatGridSkeleton />;
}
