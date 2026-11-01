import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { BrandEditor } from "@/features/branding/components/brand-editor";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { getShop } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Shop brand" };

type Props = PageProps<"/app/[orgSlug]/shops/[shopId]/brand">;

export default function ShopBrandPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <ShopBrand params={params} />
    </Suspense>
  );
}

async function ShopBrand({ params }: Pick<Props, "params">) {
  const { orgSlug, shopId } = await params;
  if (!z.uuid().safeParse(shopId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const shop = await getShop(organization.id, shopId);
  if (!shop) notFound();
  if (!can(role, "shops.update"))
    return (
      <p className="text-sm text-muted-foreground">
        Only owners and admins can change the shop&apos;s brand.
      </p>
    );
  return (
    <BrandEditor
      organizationSlug={orgSlug}
      shopId={shop.id}
      shopName={shop.name}
      branding={shop.branding}
    />
  );
}
