import { EyeIcon, MailIcon, PhoneIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/shared/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { StorefrontHeader } from "@/features/storefront/components/storefront-header";
import { getCart, getStorefrontShop } from "@/features/storefront/queries";

export async function generateMetadata({
  params,
}: LayoutProps<"/s/[shopSlug]">): Promise<Metadata> {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return { title: "Shop not found" };
  return {
    title: { default: shop.name, template: `%s · ${shop.name}` },
    description: shop.tagline ?? `Shop ${shop.name} online.`,
    // Drafts are previews for staff; never index them.
    robots: shop.live ? undefined : { index: false, follow: false },
  };
}

export default function StorefrontLayout({ params, children }: LayoutProps<"/s/[shopSlug]">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Suspense fallback={<Skeleton className="h-16 w-full rounded-none" />}>
        <Chrome params={params} />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <Suspense>
        <Footer params={params} />
      </Suspense>
    </div>
  );
}

async function Chrome({ params }: Pick<LayoutProps<"/s/[shopSlug]">, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const cart = await getCart(shop.id);

  return (
    <>
      {!shop.live && (
        <p className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm text-warning-foreground">
          <EyeIcon className="size-4" aria-hidden />
          Preview: this shop isn&apos;t live yet. Only your team can see it.
        </p>
      )}
      <StorefrontHeader shop={shop} cartCount={cart.reduce((n, l) => n + l.quantity, 0)} />
    </>
  );
}

async function Footer({ params }: Pick<LayoutProps<"/s/[shopSlug]">, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return null;
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{shop.name}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {shop.supportEmail && (
              <a
                href={`mailto:${shop.supportEmail}`}
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                <MailIcon className="size-3.5" aria-hidden />
                {shop.supportEmail}
              </a>
            )}
            {shop.supportPhone && (
              <a
                href={`tel:${shop.supportPhone}`}
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                <PhoneIcon className="size-3.5" aria-hidden />
                {shop.supportPhone}
              </a>
            )}
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs">
          Powered by <Logo className="text-xs" />
        </p>
      </div>
    </footer>
  );
}
