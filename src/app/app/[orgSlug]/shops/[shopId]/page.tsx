import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { getPaymentSettings } from "@/features/payments/queries";
import { ShopSettingsForm } from "@/features/shops/components/shop-settings-form";
import { getShop } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Shop settings" };

type Props = PageProps<"/app/[orgSlug]/shops/[shopId]">;

export default function ShopSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <ShopSettings params={params} />
    </Suspense>
  );
}

async function ShopSettings({ params }: Pick<Props, "params">) {
  const { orgSlug, shopId } = await params;
  if (!z.uuid().safeParse(shopId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const shop = await getShop(organization.id, shopId);
  if (!shop) notFound();
  const canUpdate = can(role, "shops.update");
  const payments = canUpdate
    ? await getPaymentSettings(organization.id)
    : { connected: false as const };

  return (
    <>
      {canUpdate ? (
        <ShopSettingsForm
          organizationSlug={orgSlug}
          shop={shop}
          paymentsConnected={payments.connected && payments.enabled}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can change shop settings.
        </p>
      )}
    </>
  );
}
