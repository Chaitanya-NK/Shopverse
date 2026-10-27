import { PlusIcon, WarehouseIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
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
import { listShops } from "@/features/shops/queries";
import { WarehouseCards } from "@/features/warehouses/components/warehouse-cards";
import { WarehouseFormDialog } from "@/features/warehouses/components/warehouse-form-dialog";
import { listWarehouses } from "@/features/warehouses/queries";

export const metadata: Metadata = { title: "Warehouses" };

export default function WarehousesPage({ params }: PageProps<"/app/[orgSlug]/warehouses">) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        </>
      }
    >
      <WarehousesContent params={params} />
    </Suspense>
  );
}

async function WarehousesContent({
  params,
}: Pick<PageProps<"/app/[orgSlug]/warehouses">, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  const [warehouses, shops] = await Promise.all([
    listWarehouses(organization.id),
    listShops(organization.id),
  ]);
  const canManage = can(role, "warehouses.manage");
  const shopOptions = shops.map((s) => ({ id: s.id, name: s.name }));

  const addButton = canManage && (
    <WarehouseFormDialog
      organizationSlug={orgSlug}
      shops={shopOptions}
      trigger={
        <Button>
          <PlusIcon />
          Add warehouse
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Warehouses"
        description="Where your stock lives. Link each one to the shops it ships for."
        actions={addButton}
      />
      {warehouses.length > 0 ? (
        <WarehouseCards
          organizationSlug={orgSlug}
          warehouses={warehouses}
          shops={shopOptions}
          canManage={canManage}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WarehouseIcon />
            </EmptyMedia>
            <EmptyTitle>No warehouses yet</EmptyTitle>
            <EmptyDescription>
              Add the places you keep stock: a fulfilment centre, a back room or a store floor.
            </EmptyDescription>
          </EmptyHeader>
          {addButton && <EmptyContent>{addButton}</EmptyContent>}
        </Empty>
      )}
    </>
  );
}
