import { ArrowLeftIcon, FileClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { InvoiceDocument } from "@/features/invoices/components/invoice-document";
import { PrintButton } from "@/features/invoices/components/print-button";
import { getOrderInvoice } from "@/features/invoices/queries";
import { requireMembership } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Invoice" };

type Props = PageProps<"/app/[orgSlug]/orders/[orderId]/invoice">;

export default function OrderInvoicePage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[48rem] w-full max-w-4xl rounded-xl" />}>
      <OrderInvoice params={params} />
    </Suspense>
  );
}

async function OrderInvoice({ params }: Pick<Props, "params">) {
  const { orgSlug, orderId } = await params;
  if (!z.uuid().safeParse(orderId).success) notFound();
  await requireMembership(orgSlug);
  const invoice = await getOrderInvoice(orderId);

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgOrder(orgSlug, orderId)}>
            <ArrowLeftIcon />
            Order
          </Link>
        </Button>
        {invoice && <PrintButton />}
      </div>
      {invoice ? (
        <InvoiceDocument invoice={invoice} />
      ) : (
        <Empty className="mx-auto max-w-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileClockIcon />
            </EmptyMedia>
            <EmptyTitle>No invoice yet</EmptyTitle>
            <EmptyDescription>
              The invoice is issued automatically when the first parcel is picked up.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
