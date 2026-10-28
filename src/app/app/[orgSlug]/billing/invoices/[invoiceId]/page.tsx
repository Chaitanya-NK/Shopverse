import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { PlatformInvoiceDocument } from "@/features/billing/components/platform-invoice-document";
import { getPlatformInvoice } from "@/features/billing/queries";
import { PrintButton } from "@/features/invoices/components/print-button";
import { requireMembership } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Shopverse invoice" };

type Props = PageProps<"/app/[orgSlug]/billing/invoices/[invoiceId]">;

export default function PlatformInvoicePage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[40rem] w-full max-w-4xl rounded-xl" />}>
      <PlatformInvoiceView params={params} />
    </Suspense>
  );
}

async function PlatformInvoiceView({ params }: Pick<Props, "params">) {
  const { orgSlug, invoiceId } = await params;
  if (!z.uuid().safeParse(invoiceId).success) notFound();
  const { organization } = await requireMembership(orgSlug);
  const invoice = await getPlatformInvoice(invoiceId);
  if (!invoice || invoice.organization_id !== organization.id) notFound();
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgBilling(orgSlug)}>
            <ArrowLeftIcon />
            Billing
          </Link>
        </Button>
        <PrintButton />
      </div>
      <PlatformInvoiceDocument invoice={invoice} />
    </div>
  );
}
