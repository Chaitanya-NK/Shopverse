import { CalendarClockIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { env } from "@/env";
import { OperationsSettingsForm } from "@/features/operations/components/operations-settings-form";
import { digestTasks } from "@/features/operations/digest";
import { getDigestPreview, getWarehousesMissingAddress } from "@/features/operations/queries";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { getOperationsSettings } from "@/features/shipping/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Alerts & shipping" };

type Props = PageProps<"/app/[orgSlug]/settings/operations">;

export default function OperationsSettingsPage({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Alerts & shipping"
        description="Low-stock emails, the daily digest, and the courier you ship with."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <OperationsSettings params={params} />
      </Suspense>
    </>
  );
}

async function OperationsSettings({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  const [settings, digest, missing] = await Promise.all([
    getOperationsSettings(organization.id),
    getDigestPreview(organization.id),
    getWarehousesMissingAddress(organization.id),
  ]);
  const tasks = digestTasks(digest);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {!env.CRON_SECRET && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Scheduled emails aren&apos;t set up on this server</AlertTitle>
            <AlertDescription>
              Low-stock alerts still go out right after stock changes. For the daily digest, set
              CRON_SECRET and have a scheduler call /api/cron/operations (see the README).
            </AlertDescription>
          </Alert>
        )}
        {settings.courier && missing.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Add pickup addresses</AlertTitle>
            <AlertDescription>
              <p>
                The courier needs a PIN code and state for {missing.join(", ")}.{" "}
                <Link href={routes.orgWarehouses(orgSlug)} className="underline">
                  Open Warehouses
                </Link>
              </p>
            </AlertDescription>
          </Alert>
        )}
        <OperationsSettingsForm
          organizationSlug={orgSlug}
          settings={settings}
          canEdit={can(role, "operations.settings")}
        />
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClockIcon className="size-5" aria-hidden />
            Today&apos;s digest
          </CardTitle>
          <CardDescription>What the morning email would say right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-muted-foreground">Yesterday</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(digest.sales.total, "INR")}
            </p>
            <p className="text-muted-foreground">
              {digest.sales.orders} order{digest.sales.orders === 1 ? "" : "s"}
            </p>
          </div>
          {tasks.length > 0 ? (
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={t.label}>
                  <span className="font-semibold tabular-nums">{t.count}</span> {t.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nothing is waiting today.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
