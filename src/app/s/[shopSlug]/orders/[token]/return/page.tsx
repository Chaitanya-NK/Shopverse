import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { RequestReturnForm } from "@/features/returns/components/request-return-form";
import { getShopperReturnOptions } from "@/features/returns/queries";
import { requireAccountPage } from "@/features/shopper/guard";
import { getCustomerOrder } from "@/features/storefront/queries";

export const metadata: Metadata = {
  title: "Return or exchange",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = PageProps<"/s/[shopSlug]/orders/[token]/return">;

export default function ReturnPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[32rem] max-w-2xl rounded-xl" />}>
      <ReturnRequest params={params} />
    </Suspense>
  );
}

async function ReturnRequest({ params }: Pick<Props, "params">) {
  const { shopSlug, token } = await params;
  const { shop } = await requireAccountPage(shopSlug, (slug) =>
    routes.storefrontReturn(slug, token),
  );
  const [order, options] = await Promise.all([
    getCustomerOrder(token),
    getShopperReturnOptions(shop.id, token),
  ]);
  if (!order || order.shop.slug !== shop.slug || !options) notFound();
  const anything = options.items.some((i) => i.blocked === null && i.returnable > 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href={routes.storefrontOrder(shop.slug, token)}>
          <ArrowLeftIcon />
          Order {order.number}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Return or exchange</CardTitle>
          <CardDescription>
            {options.windowDays > 0
              ? `Items can be returned within ${options.windowDays} days of delivery, unused and with their tags.`
              : "This shop doesn't accept returns online."}{" "}
            {shop.policies.includes("returns") && (
              <Link
                href={routes.storefrontPolicy(shop.slug, "returns")}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Read the returns policy
              </Link>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {anything ? (
            <RequestReturnForm
              shopSlug={shop.slug}
              orderToken={token}
              options={options}
              currency={order.currency}
            />
          ) : (
            <Alert>
              <InfoIcon />
              <AlertTitle>Nothing on this order can be returned online</AlertTitle>
              <AlertDescription>
                {shop.supportEmail || shop.supportPhone
                  ? `Contact ${shop.name} at ${[shop.supportEmail, shop.supportPhone].filter(Boolean).join(" or ")} and they'll help.`
                  : `Contact ${shop.name} and they'll help.`}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
