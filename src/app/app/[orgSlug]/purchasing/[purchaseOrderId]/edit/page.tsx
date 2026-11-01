import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { PurchaseOrderForm } from "@/features/purchasing/components/purchase-order-form";
import { getPurchaseOrder, listSuppliers } from "@/features/purchasing/queries";
import { listWarehouses } from "@/features/warehouses/queries";

export const metadata: Metadata = { title: "Edit purchase order" };

type Props = PageProps<"/app/[orgSlug]/purchasing/[purchaseOrderId]/edit">;

export default function EditPurchaseOrderPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <EditPurchaseOrder params={params} />
    </Suspense>
  );
}

async function EditPurchaseOrder({ params }: Pick<Props, "params">) {
  const { orgSlug, purchaseOrderId } = await params;
  if (!z.uuid().safeParse(purchaseOrderId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "purchasing.manage")) notFound();
  const [po, suppliers, warehouses] = await Promise.all([
    getPurchaseOrder(organization.id, purchaseOrderId),
    listSuppliers(organization.id),
    listWarehouses(organization.id),
  ]);
  if (!po) notFound();
  if (po.status !== "draft") redirect(routes.orgPurchaseOrder(orgSlug, po.id));

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgPurchaseOrder(orgSlug, po.id)}>
            <ArrowLeftIcon />
            {po.number}
          </Link>
        </Button>
        <PageHeader title={`Edit ${po.number}`} />
      </div>
      <PurchaseOrderForm
        organizationSlug={orgSlug}
        suppliers={suppliers
          .filter((s) => s.isActive || s.id === po.supplier.id)
          .map((s) => ({ id: s.id, name: s.name }))}
        warehouses={warehouses
          .filter((w) => w.isActive || w.id === po.warehouse.id)
          .map((w) => ({ id: w.id, name: w.name }))}
        initial={{
          purchaseOrderId: po.id,
          supplierId: po.supplier.id,
          warehouseId: po.warehouse.id,
          expectedAt: po.expectedAt,
          supplierReference: po.supplierReference,
          notes: po.notes,
          lines: po.lines.map((l) => ({
            variantId: l.variantId,
            sku: l.sku,
            title: l.title,
            productTitle: l.productTitle,
            quantity: l.quantity,
            unitCost: l.unitCost,
            taxRate: l.taxRate,
          })),
        }}
      />
    </>
  );
}
