import { BuildingIcon, MailIcon, PhoneIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { getStorefrontShop } from "@/features/storefront/queries";

type Props = PageProps<"/s/[shopSlug]/contact">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug } = await params;
  return { title: "Contact us", alternates: { canonical: routes.storefrontContact(shopSlug) } };
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
        <h1 className="text-3xl font-semibold tracking-tight">Contact us</h1>
        <p className="text-muted-foreground">
          Questions about an order? Include your order number and we&apos;ll get back to you.
        </p>
      </header>
      <Card>
        <CardContent className="space-y-5">
          {shop.supportEmail && (
            <div className="flex items-start gap-3">
              <MailIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
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
                <p className="text-sm text-muted-foreground">Phone / WhatsApp</p>
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
                    Chat on WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
          {(shop.legalName || shop.businessAddress) && (
            <div className="flex items-start gap-3">
              <BuildingIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
              <div className="text-sm">
                <p className="text-muted-foreground">Registered business</p>
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
              This shop hasn&apos;t added contact details yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
