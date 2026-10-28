import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { InvoiceDocument } from "@/features/invoices/components/invoice-document";
import { PrintButton } from "@/features/invoices/components/print-button";
import { getStorefrontCreditNote } from "@/features/returns/queries";
import { RETURN_REASON_LABELS } from "@/features/returns/schemas";
import { getOrderAccess } from "@/features/shopper/queries";
import { getStorefrontShop } from "@/features/storefront/queries";

export const metadata: Metadata = {
  title: "Credit note",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = PageProps<"/s/[shopSlug]/orders/[token]/returns/[returnId]/credit-note">;

export default function CustomerCreditNotePage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[48rem] w-full max-w-4xl rounded-xl" />}>
      <CustomerCreditNote params={params} />
    </Suspense>
  );
}

async function CustomerCreditNote({ params }: Pick<Props, "params">) {
  const { shopSlug, token, returnId } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop || !/^[0-9a-f-]{36}$/.test(returnId)) notFound();
  const owner = Boolean(await getOrderAccess(shop.id, token));
  const note = await getStorefrontCreditNote(token, returnId, owner);
  if (!note) notFound();

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.storefrontOrder(shop.slug, token)}>
            <ArrowLeftIcon />
            Your order
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
