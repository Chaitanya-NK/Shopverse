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
import { PurchaseOrderDocument } from "@/features/purchasing/components/purchase-order-document";
import { getPurchaseOrder } from "@/features/purchasing/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Print purchase order" };

type Props = PageProps<"/app/[orgSlug]/purchasing/[purchaseOrderId]/print">;

export default function PrintPurchaseOrderPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[48rem] w-full max-w-4xl rounded-xl" />}>
      <PrintPurchaseOrder params={params} />
    </Suspense>
  );
}

async function PrintPurchaseOrder({ params }: Pick<Props, "params">) {
  const { orgSlug, purchaseOrderId } = await params;
  if (!z.uuid().safeParse(purchaseOrderId).success) notFound();
  const { organization } = await requireMembership(orgSlug);
  const po = await getPurchaseOrder(organization.id, purchaseOrderId);
  if (!po) notFound();
  // The business's GSTIN, from its first shop that has one.
  const supabase = await createClient();
  const { data: shops } = await supabase
    .from("shops")
    .select("settings")
    .eq("organization_id", organization.id);
  const settings = (shops ?? []).map((s) => (s.settings ?? {}) as Record<string, unknown>);
  const withGstin = settings.find((s) => typeof s.gstin === "string" && s.gstin);
  const legalName = settings.find((s) => typeof s.legal_name === "string" && s.legal_name);

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgPurchaseOrder(orgSlug, po.id)}>
            <ArrowLeftIcon />
            {po.number}
          </Link>
        </Button>
        <PrintButton />
      </div>
      <PurchaseOrderDocument
        po={po}
        business={{
          name: (legalName?.legal_name as string | undefined) ?? organization.name,
          gstin: (withGstin?.gstin as string | undefined) ?? null,
        }}
      />
    </div>
  );
}
