import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BILLING_INTERVALS, PLANS, planCharge, planPrice } from "@/config/plans";
import { routes } from "@/config/routes";
import { PlanPayment } from "@/features/billing/components/plan-payment";
import { getBillingOverview } from "@/features/billing/queries";
import { choosePlanSchema } from "@/features/billing/schemas";
import { platformGstRate, platformKey } from "@/features/billing/server";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Subscribe" };

type Props = PageProps<"/app/[orgSlug]/billing/subscribe">;

export default function SubscribePage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-80 max-w-4xl rounded-xl" />
        </>
      }
    >
      <Subscribe params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Subscribe({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const { organization, role } = await requireMembership(orgSlug);
  const choice = choosePlanSchema.safeParse({
    organizationSlug: orgSlug,
    plan: query.plan,
    interval: query.interval,
  });
  const billing = await getBillingOverview(organization.id);
  // Only owners pay, only for a first plan, and only with Stripe set up.
  if (
    !choice.success ||
    !can(role, "organization.billing") ||
    platformKey() === null ||
    billing.subscription
  )
    redirect(routes.orgBilling(orgSlug));

  const { plan, interval } = choice.data;
  const gstRate = platformGstRate();
  const price = planPrice(plan, interval);
  const charge = planCharge(price, gstRate);
  const per = interval === "yearly" ? "year" : "month";
  const other = BILLING_INTERVALS.find((i) => i !== interval)!;

  return (
    <>
      <PageHeader
        title={`Subscribe to ${PLANS[plan].name}`}
        description="Pay securely here; your plan starts as soon as the payment goes through."
        actions={
          <Link
            href={routes.orgBilling(orgSlug)}
            className="inline-flex min-h-6 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            Back to billing
          </Link>
        }
      />

      <div className="grid max-w-4xl gap-6 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
            <CardDescription>
              Charged {formatMoney(charge, "INR")} now, then every {per} until you cancel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanPayment
              organizationSlug={orgSlug}
              plan={plan}
              interval={interval}
              payLabel={`Pay ${formatMoney(charge, "INR")} and subscribe`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{PLANS[plan].name}</CardTitle>
            <CardDescription>{PLANS[plan].tagline}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1.5 text-sm">
              {PLANS[plan].extras.map((extra) => (
                <li key={extra} className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {extra}
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {PLANS[plan].name}, {interval}
                </dt>
                <dd className="tabular-nums">{formatMoney(price, "INR")}</dd>
              </div>
              {gstRate ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GST ({gstRate}%)</dt>
                  <dd className="tabular-nums">{formatMoney(charge - price, "INR")}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Total per {per}</dt>
                <dd className="tabular-nums">{formatMoney(charge, "INR")}</dd>
              </div>
            </dl>
            <Link
              href={routes.orgBillingSubscribe(orgSlug, plan, other)}
              className="inline-flex min-h-6 items-center text-sm font-medium underline-offset-4 hover:underline"
            >
              {other === "yearly" ? "Pay yearly instead (two months free)" : "Pay monthly instead"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
