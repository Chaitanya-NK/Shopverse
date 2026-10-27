import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RETURN_TO_PARAM, routes, safeReturnTo } from "@/config/routes";
import { SignInFlow } from "@/features/shopper/components/sign-in-flow";
import { getShopper } from "@/features/shopper/session";
import { getStorefrontShop } from "@/features/storefront/queries";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/account/sign-in">;

export default function ShopperSignInPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-md rounded-xl" />}>
      <SignIn params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SignIn({ params, searchParams }: Props) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();

  // Only paths inside this shop: the session cookie is scoped to it.
  const account = routes.storefrontAccount(shop.slug);
  const requested = safeReturnTo((await searchParams)[RETURN_TO_PARAM], account);
  const returnTo = requested.startsWith(`${routes.storefront(shop.slug)}/`) ? requested : account;

  if (await getShopper(shop.id)) redirect(returnTo);

  return (
    <div className="mx-auto max-w-md py-6">
      {shop.live ? (
        <SignInFlow shopSlug={shop.slug} shopName={shop.name} returnTo={returnTo} />
      ) : (
        <p className="rounded-xl border bg-muted/40 p-4 text-sm">
          This shop is a preview. Shopper accounts open when it goes live.
        </p>
      )}
    </div>
  );
}
