import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { ShopSettingsForm } from "@/features/shops/components/shop-settings-form";
import { ShopStatusBadge } from "@/features/shops/components/shop-status-badge";
import { getShop } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Shop settings" };

type Props = PageProps<"/app/[orgSlug]/shops/[shopId]">;

export default function ShopSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <ShopSettings params={params} />
    </Suspense>
  );
}

async function ShopSettings({ params }: Pick<Props, "params">) {
  const { orgSlug, shopId } = await params;
  if (!z.uuid().safeParse(shopId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const shop = await getShop(organization.id, shopId);
  if (!shop) notFound();

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgShops(orgSlug)}>
            <ArrowLeftIcon />
            Shops
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{shop.name}</h1>
          <ShopStatusBadge status={shop.status} />
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link href={routes.storefront(shop.slug)} target="_blank">
              <ExternalLinkIcon />
              View shop
            </Link>
          </Button>
        </div>
      </div>
      {can(role, "shops.update") ? (
        <ShopSettingsForm organizationSlug={orgSlug} shop={shop} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can change shop settings.
        </p>
      )}
    </>
  );
}
