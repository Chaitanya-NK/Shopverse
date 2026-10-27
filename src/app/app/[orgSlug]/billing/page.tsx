import { CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PLAN_NAMES, PLANS } from "@/config/plans";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import { getBillingOverview, type PlanLimits } from "@/features/billing/queries";
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
  const billing = await getBillingOverview(organization.id);
  const canChange = can(role, "organization.billing");

  await connection();
  const daysLeft = billing.trialEndsAt ? daysUntil(billing.trialEndsAt) : null;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, what you're using, and what each plan includes."
      />

      <Card>
        <CardHeader>
          <CardDescription>Current plan</CardDescription>
          <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
            {PLAN_NAMES[billing.plan]}
            {billing.plan === "trial" && (
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
          </CardTitle>
          {billing.trialExpired && (
            <p className="text-sm text-muted-foreground">
              Your shops keep selling and orders keep flowing. Adding shops, products, warehouses or
              teammates needs a plan.
            </p>
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

      <section aria-labelledby="plans-heading" className="space-y-4">
        <h2 id="plans-heading" className="text-lg font-semibold">
          Plans
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => {
            const plan = PLANS[id];
            const limits = billing.plans[id];
            const current = billing.plan === id;
            return (
              <Card key={id} className={cn(current && "border-primary ring-1 ring-primary")}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {plan.name}
                    {current && <Badge>Current</Badge>}
                  </CardTitle>
                  <CardDescription>{plan.tagline}</CardDescription>
                  <p className="pt-2">
                    <span className="text-3xl font-semibold tabular-nums">
                      {formatMoney(plan.priceMonthly, "INR")}
                    </span>
                    <span className="text-sm text-muted-foreground"> / month + GST</span>
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {[
                      `${limitText(limits.shops)} shop${limits.shops === 1 ? "" : "s"}`,
                      `${limitText(limits.seats)} team seats`,
                      `${limitText(limits.products)} products`,
                      `${limitText(limits.warehouses)} warehouse${limits.warehouses === 1 ? "" : "s"}`,
                      ...plan.extras,
                    ].map((line) => (
                      <li key={line} className="flex gap-2">
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {line}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="mt-auto">
                  {current ? (
                    <p className="text-sm text-muted-foreground">You&apos;re on this plan.</p>
                  ) : canChange ? (
                    <UpgradeButton planName={plan.name} organizationSlug={orgSlug} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ask an owner to change the plan.
                    </p>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
