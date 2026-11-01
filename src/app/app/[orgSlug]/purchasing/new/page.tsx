import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { PurchaseOrderForm } from "@/features/purchasing/components/purchase-order-form";
import { getReorderSuggestions, listSuppliers } from "@/features/purchasing/queries";
import { listWarehouses } from "@/features/warehouses/queries";

export const metadata: Metadata = { title: "New purchase order" };

type Props = PageProps<"/app/[orgSlug]/purchasing/new">;

export default function NewPurchaseOrderPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <NewPurchaseOrder params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const uuid = z.uuid().catch("" as never);

async function NewPurchaseOrder({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "purchasing.manage")) notFound();
  const warehouseId = uuid.parse(sp.warehouse) || undefined;
  const supplierId = uuid.parse(sp.supplier) || undefined;
  const [suppliers, warehouses, suggestions] = await Promise.all([
    listSuppliers(organization.id),
    listWarehouses(organization.id),
    sp.reorder === "1" && warehouseId
      ? getReorderSuggestions(organization.id, warehouseId)
      : Promise.resolve([]),
  ]);
  const lines = suggestions
    .filter((s) => s.suggested > 0 && (s.supplier_id ?? undefined) === supplierId)
    .map((s) => ({
      variantId: s.variant_id,
      sku: s.sku,
      title: s.variant_title,
      productTitle: s.product_title,
      quantity: s.suggested,
      unitCost: s.unit_cost ?? "",
      taxRate: s.tax_rate ?? 0,
    }));

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgPurchasing(orgSlug)}>
            <ArrowLeftIcon />
            Purchasing
          </Link>
        </Button>
        <PageHeader
          title="New purchase order"
          description="Saved as a draft. Place it when it's ready to go to the supplier."
        />
      </div>
      <PurchaseOrderForm
        organizationSlug={orgSlug}
        suppliers={suppliers.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))}
        warehouses={warehouses.filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name }))}
        initial={{ supplierId, warehouseId, lines }}
      />
    </>
  );
}
