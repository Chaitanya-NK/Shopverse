import { BuildingIcon, MailIcon, PhoneIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { getStorefrontShop } from "@/features/storefront/queries";
import { T } from "@/i18n/client";
import { storefrontTitle } from "@/i18n/server";

type Props = PageProps<"/s/[shopSlug]/contact">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug } = await params;
  return {
    title: await storefrontTitle(shopSlug, "Contact us"),
    alternates: { canonical: routes.storefrontContact(shopSlug) },
  };
}

export default function ContactPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-72 max-w-2xl rounded-xl" />}>
      <Contact params={params} />
    </Suspense>
  );
}

async function Contact({ params }: Pick<Props, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const whatsapp = shop.supportPhone?.replace(/[^0-9]/g, "");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          <T>Contact us</T>
        </h1>
        <p className="text-muted-foreground">
          <T>{"Questions about an order? Include your order number and we'll get back to you."}</T>
        </p>
      </header>
      <Card>
        <CardContent className="space-y-5">
          {shop.supportEmail && (
            <div className="flex items-start gap-3">
              <MailIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm text-muted-foreground">
                  <T>Email</T>
                </p>
                <a href={`mailto:${shop.supportEmail}`} className="font-medium hover:underline">
                  {shop.supportEmail}
                </a>
              </div>
            </div>
          )}
          {shop.supportPhone && (
            <div className="flex items-start gap-3">
              <PhoneIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm text-muted-foreground">
                  <T>Phone / WhatsApp</T>
                </p>
                <a href={`tel:${shop.supportPhone}`} className="font-medium hover:underline">
                  {shop.supportPhone}
                </a>
                {whatsapp && (
                  <a
                    href={`https://wa.me/${whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 text-sm text-primary hover:underline"
                  >
                    <T>Chat on WhatsApp</T>
                  </a>
                )}
              </div>
            </div>
          )}
          {(shop.legalName || shop.businessAddress) && (
            <div className="flex items-start gap-3">
              <BuildingIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
              <div className="text-sm">
                <p className="text-muted-foreground">
                  <T>Registered business</T>
                </p>
                {shop.legalName && <p className="font-medium">{shop.legalName}</p>}
                {shop.businessAddress && <p>{shop.businessAddress}</p>}
                {shop.gstin && (
                  <p>
                    GSTIN <span className="font-mono">{shop.gstin}</span>
                  </p>
                )}
              </div>
            </div>
          )}
          {!shop.supportEmail && !shop.supportPhone && (
            <p className="text-sm text-muted-foreground">
              <T>{"This shop hasn't added contact details yet."}</T>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
