import { EyeIcon, MailIcon, PhoneIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/shared/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { AccountMenu } from "@/features/shopper/components/account-menu";
import { getShopper } from "@/features/shopper/session";
import { StorefrontHeader } from "@/features/storefront/components/storefront-header";
import { STOREFRONT_POLICIES } from "@/features/storefront/policies";
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
      <Suspense fallback={<Skeleton className="h-16 w-full rounded-none" />}>
        <Chrome params={params} />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 print:p-0">{children}</main>
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
  const [cart, shopper] = await Promise.all([getCart(shop.id), getShopper(shop.id)]);

  return (
    <>
      {!shop.live && (
        <p className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm text-warning-foreground print:hidden">
          <EyeIcon className="size-4" aria-hidden />
          Preview: this shop isn&apos;t live yet. Only your team can see it.
        </p>
      )}
      <StorefrontHeader
        shop={shop}
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
  const link = "text-muted-foreground hover:text-foreground hover:underline";
  return (
    <footer className="border-t bg-muted/30 print:hidden">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p className="font-semibold">{shop.name}</p>
          {shop.tagline && <p className="text-muted-foreground">{shop.tagline}</p>}
          <p className="text-muted-foreground">Cash on delivery across India.</p>
        </div>
        <nav aria-label="Help" className="space-y-2">
          <p className="font-medium">Help</p>
          <ul className="space-y-1.5">
            <li>
              <Link href={routes.storefrontContact(shop.slug)} className={link}>
                Contact us
              </Link>
            </li>
            <li>
              <Link href={routes.storefrontAccount(shop.slug)} className={link}>
                Your orders
              </Link>
            </li>
            {shop.policies
              .filter((p) => p === "shipping" || p === "returns")
              .map((p) => (
                <li key={p}>
                  <Link href={routes.storefrontPolicy(shop.slug, p)} className={link}>
                    {STOREFRONT_POLICIES[p]}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        <nav aria-label="Legal" className="space-y-2">
          <p className="font-medium">Legal</p>
          <ul className="space-y-1.5">
            {shop.policies
              .filter((p) => p === "privacy" || p === "terms")
              .map((p) => (
                <li key={p}>
                  <Link href={routes.storefrontPolicy(shop.slug, p)} className={link}>
                    {STOREFRONT_POLICIES[p]}
                  </Link>
                </li>
              ))}
            {shop.legalName && <li className="text-muted-foreground">{shop.legalName}</li>}
            {shop.gstin && <li className="text-muted-foreground">GSTIN {shop.gstin}</li>}
          </ul>
        </nav>
        <div className="space-y-2">
          <p className="font-medium">Get in touch</p>
          <ul className="space-y-1.5">
            {shop.supportEmail && (
              <li>
                <a
                  href={`mailto:${shop.supportEmail}`}
                  className={`inline-flex items-center gap-1.5 ${link}`}
                >
                  <MailIcon className="size-3.5" aria-hidden />
                  {shop.supportEmail}
                </a>
              </li>
            )}
            {shop.supportPhone && (
              <li>
                <a
                  href={`tel:${shop.supportPhone}`}
                  className={`inline-flex items-center gap-1.5 ${link}`}
                >
                  <PhoneIcon className="size-3.5" aria-hidden />
                  {shop.supportPhone}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t">
        <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
          © {shop.name} · Powered by <Logo className="text-xs" />
        </p>
      </div>
    </footer>
  );
}
