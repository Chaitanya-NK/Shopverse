import { CreditCardIcon, FileTextIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLAN_NAMES } from "@/config/plans";
import { routes } from "@/config/routes";
import { BillingProfileForm } from "@/features/billing/components/billing-profile-form";
import { CancelPlanButton } from "@/features/billing/components/cancel-plan-button";
import { PlanPicker } from "@/features/billing/components/plan-picker";
import {
  getBillingOverview,
  listPlatformInvoices,
  type PlanLimits,
} from "@/features/billing/queries";
import {
  platformCredentials,
  platformGstRate,
  refreshSubscription,
} from "@/features/billing/server";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { daysUntil, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

type Props = PageProps<"/app/[orgSlug]/billing">;

const USAGE: { key: keyof PlanLimits; label: string }[] = [
  { key: "shops", label: "Shops" },
  { key: "seats", label: "Team seats (incl. pending invites)" },
  { key: "products", label: "Products" },
  { key: "warehouses", label: "Active warehouses" },
];

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default function BillingPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64 rounded-xl" />
        </>
      }
    >
      <Billing params={params} />
    </Suspense>
  );
}

const limitText = (n: number | null) => (n === null ? "Unlimited" : formatNumber(n));

async function Billing({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  let billing = await getBillingOverview(organization.id);
  // A checkout that was paid but not yet heard about: ask Razorpay.
  if (billing.subscription && billing.subscription.status !== "active") {
    await refreshSubscription(billing.subscription.providerSubscriptionId);
    billing = await getBillingOverview(organization.id);
  }
  const canChange = can(role, "organization.billing");
  const canSeeInvoices = can(role, "organization.update");
  const invoices = canSeeInvoices ? await listPlatformInvoices(organization.id) : [];
  const online = platformCredentials() !== null;
  const sub = billing.subscription;

  await connection();
  const daysLeft = billing.trialEndsAt ? daysUntil(billing.trialEndsAt) : null;
  const ended = billing.plan === "trial" && billing.trialExpired && billing.hadSubscription;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your Shopverse plan, what you're using, and your invoices."
      />

      {billing.pastDueSince && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Your last payment didn&apos;t go through</AlertTitle>
          <AlertDescription>
            <p>
              Your shops keep selling. Update your payment by{" "}
              {dateFormat.format(new Date(billing.graceEndsAt!))}; after that, adding products,
              shops and teammates pauses until it&apos;s settled. Razorpay retries automatically.
            </p>
            {sub?.shortUrl && canChange && (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <a href={sub.shortUrl} target="_blank" rel="noreferrer">
                  <CreditCardIcon />
                  Update payment
                </a>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardDescription>Current plan</CardDescription>
          <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
            {ended ? "No active plan" : PLAN_NAMES[billing.plan]}
            {billing.plan === "trial" && !ended && (
              <Badge
                variant="secondary"
                className={cn(
                  "border-transparent",
                  billing.trialExpired
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning text-warning-foreground",
                )}
              >
                {billing.trialExpired
                  ? "Ended"
                  : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · until ${dateFormat.format(new Date(billing.trialEndsAt!))}`}
              </Badge>
            )}
            {sub && (
              <Badge variant="outline">
                {formatMoney(sub.amount, "INR")} / {sub.interval === "yearly" ? "year" : "month"}
              </Badge>
            )}
          </CardTitle>
          {sub?.periodEnd && (
            <p className="text-sm text-muted-foreground">
              {sub.cancelAtPeriodEnd
                ? `Cancelled: active until ${dateFormat.format(new Date(sub.periodEnd))}, then it won't renew.`
                : sub.scheduledPlan
                  ? `Renews on ${dateFormat.format(new Date(sub.periodEnd))} as ${PLAN_NAMES[sub.scheduledPlan]} (${sub.scheduledInterval}).`
                  : `Renews on ${dateFormat.format(new Date(sub.periodEnd))}.`}
            </p>
          )}
          {(billing.trialExpired || ended) && (
            <p className="text-sm text-muted-foreground">
              Your shops keep selling and orders keep flowing. Adding shops, products, warehouses or
              teammates needs a plan.
            </p>
          )}
          {sub && canChange && sub.status === "active" && !sub.cancelAtPeriodEnd && (
            <CardAction>
              <CancelPlanButton
                organizationSlug={orgSlug}
                planName={PLAN_NAMES[sub.plan]}
                endsOn={sub.periodEnd ? dateFormat.format(new Date(sub.periodEnd)) : null}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          {USAGE.map(({ key, label }) => {
            const used = billing.usage[key];
            const limit = billing.limits[key];
            const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatNumber(used)} / {limitText(limit)}
                  </span>
                </div>
                <Progress
                  value={limit ? pct : 4}
                  aria-label={`${label}: ${used} of ${limitText(limit)}`}
                  className={cn(
                    "h-2",
                    limit && pct >= 100 && "[&>div]:bg-destructive",
                    limit && pct >= 80 && pct < 100 && "[&>div]:bg-amber-500",
                  )}
                />
              </div>
            );
          })}
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {formatNumber(billing.usage.ordersThisMonth)} orders this month. Orders are never
            limited.
          </p>
        </CardContent>
      </Card>

      <PlanPicker
        organizationSlug={orgSlug}
        online={online}
        canChange={canChange}
        hasProfile={Boolean(billing.profile.legalName)}
        gstRate={platformGstRate()}
        current={
          sub
            ? {
                plan: sub.plan,
                interval: sub.interval,
                active: sub.status === "active",
                ending: sub.cancelAtPeriodEnd,
                scheduled:
                  sub.scheduledPlan && sub.scheduledInterval
                    ? { plan: sub.scheduledPlan, interval: sub.scheduledInterval }
                    : null,
              }
            : null
        }
        limits={billing.plans}
        overages={billing.overages}
      />

      {canSeeInvoices && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Billing details</CardTitle>
              <CardDescription>
                {online && !billing.profile.legalName && canChange
                  ? "Add these before choosing a plan. They go on your invoices."
                  : "Printed on Shopverse's invoices to you."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BillingProfileForm
                organizationSlug={orgSlug}
                profile={billing.profile}
                disabled={!canChange}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>A GST invoice for every payment.</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="pl-3">Invoice</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="pr-3 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="pl-3">
                            <Link
                              href={routes.orgPlatformInvoice(orgSlug, i.id)}
                              className="inline-flex items-center gap-1.5 font-mono font-medium hover:underline"
                            >
                              <FileTextIcon className="size-3.5" aria-hidden />
                              {i.number}
                            </Link>
                            <span className="block text-xs text-muted-foreground">
                              {shortDate.format(new Date(i.issuedAt))}
                            </span>
                          </TableCell>
                          <TableCell>
                            {PLAN_NAMES[i.plan as keyof typeof PLAN_NAMES] ?? i.plan}{" "}
                            <span className="text-muted-foreground">· {i.interval}</span>
                          </TableCell>
                          <TableCell className="pr-3 text-right font-mono tabular-nums">
                            {formatMoney(i.total, "INR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
