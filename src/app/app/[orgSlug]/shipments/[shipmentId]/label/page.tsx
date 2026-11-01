import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { PrintButton } from "@/features/invoices/components/print-button";
import { requireMembership } from "@/features/organizations/queries";
import { ShippingLabel } from "@/features/shipping/components/shipment-documents";
import { getShipmentDocument } from "@/features/shipping/queries";

export const metadata: Metadata = { title: "Shipping label" };

type Props = PageProps<"/app/[orgSlug]/shipments/[shipmentId]/label">;

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[36rem] w-full max-w-3xl rounded-xl" />}>
      <ShipmentLabel params={params} />
    </Suspense>
  );
}

async function ShipmentLabel({ params }: Pick<Props, "params">) {
  const { orgSlug, shipmentId } = await params;
  if (!z.uuid().safeParse(shipmentId).success) notFound();
  await requireMembership(orgSlug);
  const doc = await getShipmentDocument(shipmentId);
  if (!doc) notFound();

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgOrder(orgSlug, doc.order.id)}>
            <ArrowLeftIcon />
            {doc.order.number}
          </Link>
        </Button>
        <PrintButton />
      </div>
      <ShippingLabel doc={doc} />
    </div>
  );
}
