import { WifiOffIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ReloadButton } from "@/features/storefront/components/install-app";
import { getStorefrontShop } from "@/features/storefront/queries";
import { T } from "@/i18n/client";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/offline">;

/** Cached by the service worker and shown when there's no connection. No live data. */
export default function OfflinePage({ params }: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <WifiOffIcon className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">
        <T>{"You're offline"}</T>
      </h1>
      <p className="text-muted-foreground">
        <T>Check your connection.</T>{" "}
        <Suspense fallback={<T>{"Your cart is saved and will be here when you're back."}</T>}>
          <ShopLine params={params} />
        </Suspense>
      </p>
      <ReloadButton />
    </div>
  );
}

async function ShopLine({ params }: Pick<Props, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  return shop ? (
    <T vars={{ shop: shop.name }}>
      {"Your {shop} cart is saved and will be here when you're back."}
    </T>
  ) : (
    <T>{"Your cart is saved and will be here when you're back."}</T>
  );
}
