import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderForm } from "@/features/orders/components/order-form";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { SHOP_PARAM } from "@/features/shops/schemas";

export const metadata: Metadata = { title: "New order" };

type Props = PageProps<"/app/[orgSlug]/orders/new">;

export default function NewOrderPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Skeleton className="h-[36rem] rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </>
      }
    >
      <NewOrderContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NewOrderContent({ params, searchParams }: Props) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "orders.manage")) notFound();

  const shops = await listShops(organization.id);
  const shopSlug = typeof query[SHOP_PARAM] === "string" ? query[SHOP_PARAM] : null;
  const defaultShop = shops.find((s) => s.slug === shopSlug) ?? shops[0];

  return (
    <>
      <PageHeader
        title="New order"
        description="For phone, WhatsApp and counter sales. Stock is reserved in the shop's warehouses when you confirm."
      />
      <OrderForm
        organizationSlug={orgSlug}
        shops={shops.map((s) => ({ id: s.id, name: s.name, currency: s.currency }))}
        defaultShopId={defaultShop?.id}
      />
    </>
  );
}
