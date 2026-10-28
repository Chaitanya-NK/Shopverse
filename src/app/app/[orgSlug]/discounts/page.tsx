import { BadgePercentIcon, PlusIcon } from "lucide-react";
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
import { DiscountDialog } from "@/features/discounts/components/discount-dialog";
import { DiscountsTable } from "@/features/discounts/components/discounts-table";
import { listDiscounts } from "@/features/discounts/queries";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Discounts" };

type Props = PageProps<"/app/[orgSlug]/discounts">;

export default function DiscountsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Discounts params={params} />
    </Suspense>
  );
}

async function Discounts({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  const [discounts, shops] = await Promise.all([
    listDiscounts(organization.id),
    listShops(organization.id),
  ]);
  const canManage = can(role, "catalog.manage");
  const shopOptions = shops.map((s) => ({ id: s.id, name: s.name }));
  const newButton = canManage && (
    <DiscountDialog
      organizationSlug={orgSlug}
      shops={shopOptions}
      trigger={
        <Button>
          <PlusIcon />
          New discount
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Codes for your shoppers and automatic offers. GST is charged on the discounted price."
        actions={discounts.length > 0 ? newButton : undefined}
      />
      {discounts.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BadgePercentIcon />
            </EmptyMedia>
            <EmptyTitle>No discounts yet</EmptyTitle>
            <EmptyDescription>
              Create a code like WELCOME10 for new customers, or an automatic festive offer.
            </EmptyDescription>
          </EmptyHeader>
          {newButton && <EmptyContent>{newButton}</EmptyContent>}
        </Empty>
      ) : (
        <DiscountsTable
          organizationSlug={orgSlug}
          discounts={discounts}
          shops={shopOptions}
          currency={shops[0]?.currency ?? "INR"}
          canManage={canManage}
        />
      )}
    </>
  );
}
