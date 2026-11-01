import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/env";
import { DomainSettings } from "@/features/domains/components/domain-settings";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { getShop } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Shop domain" };

type Props = PageProps<"/app/[orgSlug]/shops/[shopId]/domain">;

export default function ShopDomainPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ShopDomain params={params} />
    </Suspense>
  );
}

async function ShopDomain({ params }: Pick<Props, "params">) {
  const { orgSlug, shopId } = await params;
  if (!z.uuid().safeParse(shopId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const shop = await getShop(organization.id, shopId);
  if (!shop) notFound();
  if (!can(role, "shops.update"))
    return (
      <p className="text-sm text-muted-foreground">
        Only owners and admins can change the shop&apos;s domain.
      </p>
    );
  return (
    <DomainSettings
      organizationSlug={orgSlug}
      shopId={shop.id}
      domain={shop.customDomain}
      token={shop.domainToken}
      verifiedAt={shop.domainVerifiedAt}
      appHost={new URL(env.NEXT_PUBLIC_APP_URL).host}
      shopLive={shop.status === "live"}
    />
  );
}
