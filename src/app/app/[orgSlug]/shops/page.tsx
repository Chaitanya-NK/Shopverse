import { StoreIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { CreateShopDialog } from "@/features/shops/components/create-shop-dialog";
import { ShopsTable } from "@/features/shops/components/shops-table";
import { listShops } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Shops" };

export default function ShopsPage({ params }: PageProps<"/app/[orgSlug]/shops">) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64 rounded-xl" />
        </>
      }
    >
      <ShopsContent params={params} />
    </Suspense>
  );
}

async function ShopsContent({ params }: Pick<PageProps<"/app/[orgSlug]/shops">, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  const shops = await listShops(organization.id);
  const canCreate = can(role, "shops.create");

  return (
    <>
      <PageHeader
        title="Shops"
        description="Each shop has its own storefront, catalogue, prices and domain, and draws on shared stock."
        actions={canCreate && <CreateShopDialog organizationSlug={orgSlug} />}
      />
      {shops.length > 0 ? (
        <ShopsTable
          shops={shops}
          organizationSlug={orgSlug}
          canManage={can(role, "shops.update")}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StoreIcon />
            </EmptyMedia>
            <EmptyTitle>No shops you can access</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Create your first shop to start selling."
                : "Ask an admin to give you access to a shop."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate && (
            <EmptyContent>
              <CreateShopDialog organizationSlug={orgSlug} />
            </EmptyContent>
          )}
        </Empty>
      )}
    </>
  );
}
