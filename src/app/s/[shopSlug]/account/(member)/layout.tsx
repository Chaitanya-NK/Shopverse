import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { SectionTabs } from "@/components/shared/section-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { getShopper } from "@/features/shopper/session";
import { getStorefrontShop } from "@/features/storefront/queries";

export default function AccountLayout({ params, children }: LayoutProps<"/s/[shopSlug]/account">) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Suspense fallback={<Skeleton className="h-24 rounded-xl" />}>
        <AccountHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function AccountHeader({ params }: Pick<LayoutProps<"/s/[shopSlug]/account">, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const shopper = await getShopper(shop.id);
  if (!shopper) redirect(routes.storefrontSignIn(shop.slug, routes.storefrontAccount(shop.slug)));

  return (
    <header className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {shopper.name ? `Hi, ${shopper.name.split(" ")[0]}` : "Your account"}
        </h1>
        <p className="text-sm text-muted-foreground">{shopper.email}</p>
      </div>
      <SectionTabs
        label="Account"
        tabs={[
          { href: routes.storefrontAccount(shop.slug), label: "Orders" },
          { href: routes.storefrontWishlist(shop.slug), label: "Wishlist" },
          { href: routes.storefrontAddresses(shop.slug), label: "Addresses" },
          { href: routes.storefrontProfile(shop.slug), label: "Profile" },
        ]}
      />
    </header>
  );
}
