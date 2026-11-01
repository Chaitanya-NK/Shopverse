import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { SectionTabs } from "@/components/shared/section-tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { requireMembership } from "@/features/organizations/queries";
import { ShopStatusBadge } from "@/features/shops/components/shop-status-badge";
import { getShop } from "@/features/shops/queries";

type Props = LayoutProps<"/app/[orgSlug]/shops/[shopId]">;

/** A shop's settings, brand, design and domain, under one header. */
export default function ShopLayout({ params, children }: Props) {
  return (
    <>
      <Suspense fallback={<Skeleton className="h-24 w-full max-w-xl" />}>
        <Header params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function Header({ params }: Pick<Props, "params">) {
  const { orgSlug, shopId } = await params;
  if (!z.uuid().safeParse(shopId).success) notFound();
  const { organization } = await requireMembership(orgSlug);
  const shop = await getShop(organization.id, shopId);
  if (!shop) notFound();
  return (
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
      <SectionTabs
        label="Shop sections"
        tabs={[
          { href: routes.orgShop(orgSlug, shop.id), label: "Settings" },
          { href: routes.orgShopBrand(orgSlug, shop.id), label: "Brand" },
          { href: routes.orgShopDesign(orgSlug, shop.id), label: "Design" },
          { href: routes.orgShopDomain(orgSlug, shop.id), label: "Domain" },
        ]}
      />
    </div>
  );
}
