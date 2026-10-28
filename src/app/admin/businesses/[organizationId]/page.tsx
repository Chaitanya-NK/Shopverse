import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PLAN_NAMES } from "@/config/plans";
import { routes } from "@/config/routes";
import { BusinessActions } from "@/features/admin/components/business-actions";
import { PlanStatus } from "@/features/admin/components/plan-status";
import { getBusiness } from "@/features/admin/queries";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Business" };

type Props = PageProps<"/admin/businesses/[organizationId]">;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const d = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "—");

const AUDIT_LABELS: Record<string, string> = {
  "admin.trial_extended": "Trial extended",
  "admin.plan_set": "Plan set by Shopverse",
  "billing.updated": "Billing details updated",
  "subscription.active": "Subscription active",
  "subscription.authenticated": "Payment method authorised",
  "subscription.pending": "Payment failed",
  "subscription.halted": "Payments stopped",
  "subscription.cancelled": "Plan ended",
  "subscription.completed": "Plan completed",
  "subscription.upgraded": "Upgraded",
  "subscription.change_scheduled": "Plan change scheduled",
  "subscription.cancel_requested": "Cancelled (at period end)",
};

export default function BusinessPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Business params={params} />
    </Suspense>
  );
}

async function Business({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  if (!z.uuid().safeParse(organizationId).success) notFound();
  const b = await getBusiness(organizationId);
  if (!b) notFound();
  const live = b.subscriptions.find((s) =>
    ["authenticated", "active", "pending", "halted"].includes(s.status),
  );
  const usage: [string, string][] = [
    ["shops", "Shops"],
    ["products", "Products"],
    ["warehouses", "Warehouses"],
    ["seats", "Team seats"],
  ];

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.adminBusinesses}>
            <ArrowLeftIcon />
            Businesses
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{b.name}</h1>
              <PlanStatus b={b} />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{b.slug}</span> · since {d(b.created_at)} ·{" "}
              {b.industries.join(", ") || "no industries"}
            </p>
          </div>
          <BusinessActions
            organizationId={b.id}
            name={b.name}
            plan={b.plan}
            subscribed={Boolean(live)}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>
                {formatNumber(b.orders_30d)} orders and {formatMoney(b.gmv_30d, "INR")} sold in 30
                days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-4">
                {usage.map(([key, label]) => (
                  <div key={key}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="font-mono text-lg tabular-nums">
                      {formatNumber(b.usage[key] ?? 0)}
                      <span className="text-sm text-muted-foreground">
                        {" "}
                        /{" "}
                        {b.limits[key] === null || b.limits[key] === undefined
                          ? "∞"
                          : formatNumber(b.limits[key]!)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {b.subscriptions.length === 0 && (
                <p className="text-muted-foreground">Never subscribed.</p>
              )}
              {b.subscriptions.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <span>
                    <span className="font-medium">
                      {PLAN_NAMES[s.plan]} · {s.interval}
                    </span>{" "}
                    <span className="text-muted-foreground">{formatMoney(s.amount, "INR")}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {s.provider_subscription_id}
                    </span>
                  </span>
                  <span className="text-right">
                    <Badge variant={s.status === "active" ? "default" : "outline"}>
                      {s.status}
                    </Badge>
                    <span className="block text-xs text-muted-foreground">
                      {s.ended_at
                        ? `ended ${d(s.ended_at)}`
                        : s.cancel_at_period_end
                          ? `ends ${d(s.current_period_end)}`
                          : `renews ${d(s.current_period_end)}`}
                    </span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {b.invoices.length === 0 && <p className="text-muted-foreground">No invoices.</p>}
              {b.invoices.map((i) => (
                <div key={i.id} className="flex justify-between gap-4">
                  <Link href={routes.adminInvoice(i.id)} className="font-mono hover:underline">
                    {i.number}
                  </Link>
                  <span className="text-muted-foreground">{d(i.issued_at)}</span>
                  <span className="font-mono tabular-nums">{formatMoney(i.total, "INR")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Team</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {b.members.map((m) => (
                <div key={m.email} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {m.name ?? m.email}
                    <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                  </span>
                  <Badge variant="outline" className="h-fit capitalize">
                    {m.role}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Shops</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {b.shops.map((s) => (
                <div key={s.slug} className="flex justify-between gap-2">
                  <Link href={routes.storefront(s.slug)} className="hover:underline">
                    {s.name}
                  </Link>
                  <span className="text-muted-foreground capitalize">{s.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Billing history</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {b.audit.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}
                {b.audit.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{AUDIT_LABELS[a.action] ?? a.action}</span>
                    {typeof a.metadata.note === "string" && (
                      <span className="block text-muted-foreground">“{a.metadata.note}”</span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {timeFormat.format(new Date(a.at))}
                      {a.actor && ` · ${a.actor}`}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
