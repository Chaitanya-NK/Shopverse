import { PartyPopperIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RETURN_TO_PARAM, routes, safeReturnTo } from "@/config/routes";
import { ProfileForm } from "@/features/shopper/components/profile-form";
import { requireAccountPage } from "@/features/shopper/guard";
import { T } from "@/i18n/client";
import { storefrontTitle } from "@/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/s/[shopSlug]/account/profile">): Promise<Metadata> {
  const { shopSlug } = await params;
  return { title: await storefrontTitle(shopSlug, "Profile"), robots: { index: false } };
}

type Props = PageProps<"/s/[shopSlug]/account/profile">;

export default function ProfilePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
      <Profile params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Profile({ params, searchParams }: Props) {
  const { shopSlug } = await params;
  const { shop, shopper } = await requireAccountPage(shopSlug, routes.storefrontProfile);
  const query = await searchParams;
  const welcome = query.welcome === "1" && !shopper.name;
  const next = safeReturnTo(query[RETURN_TO_PARAM], routes.storefront(shop.slug));
  const continueTo = next.startsWith(routes.storefront(shop.slug))
    ? next
    : routes.storefront(shop.slug);

  return (
    <div className="space-y-6">
      {welcome && (
        <Alert>
          <PartyPopperIcon />
          <AlertTitle>
            <T vars={{ shop: shop.name }}>{"Welcome to {shop}!"}</T>
          </AlertTitle>
          <AlertDescription>
            <T>Add your name so we know who to deliver to.</T>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <T>Your details</T>
          </CardTitle>
          <CardDescription>
            <T>Used to fill in checkout. We never share them.</T>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            shopSlug={shop.slug}
            shopName={shop.name}
            profile={shopper}
            redirectTo={welcome ? continueTo : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
