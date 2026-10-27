import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { AddressBook } from "@/features/shopper/components/address-book";
import { requireAccountPage } from "@/features/shopper/guard";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/account/addresses">;

export default function AddressesPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <Addresses params={params} />
    </Suspense>
  );
}

async function Addresses({ params }: Pick<Props, "params">) {
  const { shopSlug } = await params;
  const { shop, shopper } = await requireAccountPage(shopSlug, routes.storefrontAddresses);
  return <AddressBook shopSlug={shop.slug} addresses={shopper.addresses} />;
}
