import { WifiOffIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ReloadButton } from "@/features/storefront/components/install-app";
import { getStorefrontShop } from "@/features/storefront/queries";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/offline">;

/** Cached by the service worker and shown when there's no connection. No live data. */
export default function OfflinePage({ params }: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <WifiOffIcon className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="text-muted-foreground">
        Check your connection.{" "}
        <Suspense fallback="Your cart is saved">
          <ShopLine params={params} />
        </Suspense>{" "}
        and will be here when you&apos;re back.
      </p>
      <ReloadButton />
    </div>
  );
}

async function ShopLine({ params }: Pick<Props, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  return <>Your {shop ? `${shop.name} ` : ""}cart is saved</>;
}
