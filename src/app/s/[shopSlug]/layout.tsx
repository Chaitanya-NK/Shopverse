import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/lora/wght.css";
import "@fontsource-variable/nunito/wght.css";
import "@fontsource-variable/playfair-display/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";

import { EyeIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { brandImageUrl } from "@/features/branding/schemas";
import { brandTheme, brandThemeCss } from "@/features/branding/theme";
import { PreviewBridge } from "@/features/design/components/preview-bridge";
import { getStorefrontDesign } from "@/features/design/queries";
import {
  StorefrontAnnouncement,
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/design/render/chrome";
import { designCss } from "@/features/design/style";
import { AccountMenu } from "@/features/shopper/components/account-menu";
import { getShopper } from "@/features/shopper/session";
import { ThemeColor } from "@/features/storefront/components/theme-color";
import { getCart, getStorefrontShop } from "@/features/storefront/queries";

export async function generateMetadata({
  params,
}: LayoutProps<"/s/[shopSlug]">): Promise<Metadata> {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return { title: "Shop not found" };
  const logo = shop.branding.logo;
  const base = shop.domain ? `https://${shop.domain}` : undefined;
  return {
    ...(base && { metadataBase: new URL(base) }),
    manifest: routes.storefrontManifest(shop.slug),
    icons: logo
      ? {
          icon: brandImageUrl(logo.path, "logo", "small"),
          apple: routes.storefrontIcon(shop.slug, 180),
        }
      : {
          icon: routes.storefrontIcon(shop.slug, 192),
          apple: routes.storefrontIcon(shop.slug, 180),
        },
    appleWebApp: { capable: true, title: shop.name, statusBarStyle: "default" },
    title: { default: shop.name, template: `%s · ${shop.name}` },
    description: shop.tagline ?? `Shop ${shop.name} online.`,
    alternates: { canonical: routes.storefront(shop.slug) },
    openGraph: {
      type: "website",
      siteName: shop.name,
      title: shop.name,
      description: shop.tagline ?? `Shop ${shop.name} online.`,
      url: routes.storefront(shop.slug),
    },
    // Drafts are previews for staff; never index them.
    robots: shop.live ? undefined : { index: false, follow: false },
  };
}

export default function StorefrontLayout({ params, children }: LayoutProps<"/s/[shopSlug]">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Suspense>
        <Theme params={params} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-16 w-full rounded-none" />}>
        <Chrome params={params} />
      </Suspense>
      <main className="mx-auto w-full max-w-(--sv-width) flex-1 px-4 py-8 print:p-0">
        {children}
      </main>
      <Suspense>
        <Footer params={params} />
      </Suspense>
    </div>
  );
}

/** The shop's brand colour and design style, applied to the whole page (dialogs and toasts too). */
async function Theme({ params }: Pick<LayoutProps<"/s/[shopSlug]">, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return null;
  const theme = brandTheme(shop.branding.color);
  const { design, preview } = await getStorefrontDesign(shop);
  return (
    <>
      <ThemeColor color={theme.primary} />
      {shop.branding.color && <style>{brandThemeCss(theme)}</style>}
      <style>{designCss(design.style)}</style>
      {preview && <PreviewBridge exitHref={routes.storefrontPreviewExit(shop.slug)} />}
    </>
  );
}

async function Chrome({ params }: Pick<LayoutProps<"/s/[shopSlug]">, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const [cart, shopper, { design }] = await Promise.all([
    getCart(shop.id),
    getShopper(shop.id),
    getStorefrontDesign(shop),
  ]);

  return (
    <>
      {!shop.live && (
        <p className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm text-warning-foreground print:hidden">
          <EyeIcon className="size-4" aria-hidden />
          Preview: this shop isn&apos;t live yet. Only your team can see it.
        </p>
      )}
      <StorefrontAnnouncement shop={shop} design={design} />
      <StorefrontHeader
        shop={shop}
        design={design}
        cartCount={cart.reduce((n, l) => n + l.quantity, 0)}
        account={
          shop.live && (
            <AccountMenu
              shopSlug={shop.slug}
              shopper={shopper && { name: shopper.name, email: shopper.email }}
            />
          )
        }
      />
    </>
  );
}

async function Footer({ params }: Pick<LayoutProps<"/s/[shopSlug]">, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return null;
  const { design } = await getStorefrontDesign(shop);
  return <StorefrontFooter shop={shop} design={design} />;
}
