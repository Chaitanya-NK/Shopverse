import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { SetupChecklist } from "@/features/dashboard/components/setup-checklist";
import { StatCards, StatCardsSkeleton } from "@/features/dashboard/components/stat-cards";
import { getOverviewStats } from "@/features/dashboard/queries";
import { requireMembership } from "@/features/organizations/queries";
import { ShopsTable } from "@/features/shops/components/shops-table";
import { listShops } from "@/features/shops/queries";
import { SHOP_PARAM } from "@/features/shops/schemas";

export const metadata: Metadata = { title: "Overview" };

type Props = PageProps<"/app/[orgSlug]">;

export default function OverviewPage({ params, searchParams }: Props) {
  return (
    <>
      <Suspense fallback={<HeaderSkeleton />}>
        <OverviewHeader params={params} />
      </Suspense>
      <Suspense fallback={<StatCardsSkeleton />}>
        <OverviewStats params={params} searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
        <OverviewBody params={params} />
      </Suspense>
    </>
  );
}

async function OverviewHeader({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization } = await requireMembership(orgSlug);
  return (
    <PageHeader title={organization.name} description="Today across your shops and warehouses." />
  );
}

async function OverviewStats({ params, searchParams }: Props) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const { organization } = await requireMembership(orgSlug);
  const shops = await listShops(organization.id);

  const shopSlug = typeof query[SHOP_PARAM] === "string" ? query[SHOP_PARAM] : null;
  const shop = shops.find((s) => s.slug === shopSlug) ?? null;
  const stats = await getOverviewStats(organization.id, shop?.id);

  return <StatCards stats={stats} currency={shop?.currency ?? shops[0]?.currency ?? "INR"} />;
}

async function OverviewBody({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization } = await requireMembership(orgSlug);
  const [shops, stats] = await Promise.all([
    listShops(organization.id),
    getOverviewStats(organization.id),
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Your shops</CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href={routes.orgShops(orgSlug)}>Manage shops</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ShopsTable shops={shops} />
        </CardContent>
      </Card>
      <SetupChecklist
        items={[
          {
            label: "Create your workspace",
            description: "Business, first shop and warehouse.",
            done: true,
          },
          {
            label: "Add your first product",
            description: "Products are shared by every shop in your workspace.",
            done: stats.active_products > 0,
          },
          {
            label: "Receive stock into a warehouse",
            description: "Every change is recorded in the stock ledger.",
            done: stats.skus_in_stock > 0,
          },
          {
            label: "Take a shop live",
            description: "Publish your storefront to start taking orders.",
            done: shops.some((s) => s.status === "live"),
          },
        ]}
      />
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}
