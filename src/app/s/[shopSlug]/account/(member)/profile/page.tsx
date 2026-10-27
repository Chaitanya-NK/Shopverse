import { PartyPopperIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RETURN_TO_PARAM, routes, safeReturnTo } from "@/config/routes";
import { ProfileForm } from "@/features/shopper/components/profile-form";
import { requireAccountPage } from "@/features/shopper/guard";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

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
          <AlertTitle>Welcome to {shop.name}!</AlertTitle>
          <AlertDescription>Add your name so we know who to deliver to.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>Used to fill in checkout. We never share them.</CardDescription>
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
