import { PackageIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SimplePagination } from "@/components/shared/simple-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { OrderActions } from "@/features/shopper/components/order-actions";
import { requireAccountPage } from "@/features/shopper/guard";
import { getShopperOrders } from "@/features/shopper/queries";
import { ORDER_STAGE_LABELS, type OrderStage } from "@/features/shopper/schemas";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/account">;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const STAGE_VARIANT: Record<OrderStage, "default" | "secondary" | "outline" | "destructive"> = {
  placed: "outline",
  confirmed: "secondary",
  packed: "secondary",
  shipped: "default",
  out_for_delivery: "default",
  delivered: "outline",
  returned: "outline",
  cancelled: "destructive",
};

export default function AccountOrdersPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Orders params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ params, searchParams }: Props) {
  const { shopSlug } = await params;
  const { shop } = await requireAccountPage(shopSlug, routes.storefrontAccount);
  const page = Number((await searchParams).page) || 1;
  const orders = await getShopperOrders(shop.id, page);
  if (!orders) return null;

  if (orders.total === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageIcon />
          </EmptyMedia>
          <EmptyTitle>No orders yet</EmptyTitle>
          <EmptyDescription>When you order from {shop.name}, it shows up here.</EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <Link href={routes.storefront(shop.slug)}>Start shopping</Link>
        </Button>
      </Empty>
    );

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {orders.items.map((order) => (
          <li key={order.token}>
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Link
                      href={routes.storefrontOrder(shop.slug, order.token)}
                      className="font-mono font-medium hover:underline"
                    >
                      {order.number}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {dateFormat.format(new Date(order.placedAt))} · {order.itemCount} item
                      {order.itemCount === 1 ? "" : "s"} ·{" "}
                      {formatMoney(order.grandTotal, order.currency)}
                    </p>
                  </div>
                  <Badge variant={STAGE_VARIANT[order.stage]}>
                    {ORDER_STAGE_LABELS[order.stage]}
                  </Badge>
                </div>
                <p className="line-clamp-1 text-sm">
                  {order.titles.join(", ")}
                  {order.itemCount > order.titles.length && "…"}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button asChild variant="link" className="px-0">
                    <Link href={routes.storefrontOrder(shop.slug, order.token)}>View details</Link>
                  </Button>
                  <OrderActions
                    shopSlug={shop.slug}
                    orderToken={order.token}
                    orderNumber={order.number}
                    canCancel={order.canCancel}
                    size="sm"
                  />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {orders.pageCount > 1 && (
        <SimplePagination
          page={orders.page}
          pageCount={orders.pageCount}
          total={orders.total}
          noun="orders"
          hrefFor={(p) => `${routes.storefrontAccount(shop.slug)}?page=${p}`}
        />
      )}
    </div>
  );
}
