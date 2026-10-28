import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { InvoiceDocument } from "@/features/invoices/components/invoice-document";
import { PrintButton } from "@/features/invoices/components/print-button";
import { requireMembership } from "@/features/organizations/queries";
import { getReturnCreditNote } from "@/features/returns/queries";
import { RETURN_REASON_LABELS } from "@/features/returns/schemas";

export const metadata: Metadata = { title: "Credit note" };

type Props = PageProps<"/app/[orgSlug]/returns/[returnId]/credit-note">;

export default function CreditNotePage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[48rem] w-full max-w-4xl rounded-xl" />}>
      <CreditNote params={params} />
    </Suspense>
  );
}

async function CreditNote({ params }: Pick<Props, "params">) {
  const { orgSlug, returnId } = await params;
  if (!z.uuid().safeParse(returnId).success) notFound();
  await requireMembership(orgSlug);
  const note = await getReturnCreditNote(returnId);
  if (!note) notFound();

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgReturn(orgSlug, returnId)}>
            <ArrowLeftIcon />
            Return {note.creditNote.returnNumber}
          </Link>
        </Button>
        <PrintButton />
      </div>
      <InvoiceDocument
        invoice={note.document}
        creditNote={{
          ...note.creditNote,
          reasonLabel: RETURN_REASON_LABELS[note.creditNote.reason],
        }}
      />
    </div>
  );
}
