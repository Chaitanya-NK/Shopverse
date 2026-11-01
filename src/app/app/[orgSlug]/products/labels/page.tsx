import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { LabelSheet } from "@/features/labels/components/label-sheet";
import { LABEL_SELECT, parseLabelParam, toLabelVariant } from "@/features/labels/shared";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Barcode labels" };

type Props = PageProps<"/app/[orgSlug]/products/labels">;

export default function LabelsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Labels params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Labels({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const { v } = await searchParams;
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "inventory.adjust")) notFound();
  const wanted = parseLabelParam(v);
  let initial: Parameters<typeof LabelSheet>[0]["initial"] = [];
  if (wanted.size > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("product_variants")
      .select(LABEL_SELECT)
      .eq("organization_id", organization.id)
      .in("id", [...wanted.keys()]);
    if (error) throw fromPostgrestError(error);
    initial = data.map((row) => ({ ...toLabelVariant(row), copies: wanted.get(row.id) ?? 1 }));
  }

  return (
    <>
      <div className="space-y-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgProducts(orgSlug)}>
            <ArrowLeftIcon />
            Products
          </Link>
        </Button>
        <PageHeader
          title="Barcode labels"
          description="Print shelf and product labels that any barcode scanner (and the inventory scan box) can read."
        />
      </div>
      <LabelSheet organizationSlug={orgSlug} initial={initial} />
    </>
  );
}
