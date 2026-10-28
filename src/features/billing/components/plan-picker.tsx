"use client";

import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type BillingInterval,
  isUpgrade,
  PLAN_ORDER,
  type PaidPlanId,
  planCharge,
  planPrice,
  PLANS,
  YEARLY_MONTHS,
} from "@/config/plans";
import { changePlan, confirmPlanCheckout, startPlanCheckout } from "@/features/billing/actions";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import { type PlanLimits } from "@/features/billing/queries";
import { loadCheckout } from "@/features/payments/components/use-razorpay-checkout";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Current = {
  plan: PaidPlanId;
  interval: BillingInterval;
  active: boolean;
  scheduled: { plan: PaidPlanId; interval: BillingInterval } | null;
  ending: boolean;
} | null;

type Props = {
  organizationSlug: string;
  /** Online billing set up (otherwise plan changes are requested by email). */
  online: boolean;
  canChange: boolean;
  hasProfile: boolean;
  gstRate: number | null;
  current: Current;
  limits: Record<PaidPlanId, PlanLimits>;
  overages: Record<PaidPlanId, { resource: string; used: number; limit: number }[]>;
};

const limitText = (n: number | null) => (n === null ? "Unlimited" : formatNumber(n));
const NOUN: Record<string, string> = {
  shops: "shops",
  seats: "team seats",
  products: "products",
  warehouses: "warehouses",
};

/** The three plans, monthly or yearly, with what each choice will do. */
export function PlanPicker(props: Props) {
  const { current } = props;
  const [interval, setInterval] = useState<BillingInterval>(current?.interval ?? "monthly");
  return (
    <section aria-labelledby="plans-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="plans-heading" className="text-lg font-semibold">
          Plans
        </h2>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={interval}
          onValueChange={(v) => v && setInterval(v as BillingInterval)}
          aria-label="Billing period"
        >
          <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
          <ToggleGroupItem value="yearly">Yearly · 2 months free</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => (
          <PlanCard key={id} {...props} id={id} interval={interval} />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Prices {props.gstRate ? `exclude GST (${props.gstRate}%, added at checkout)` : "are final"}.
        Upgrades start straight away; smaller plans and switching to monthly start at your next
        renewal. Cancel any time: the plan runs to the end of the period you paid for.
      </p>
    </section>
  );
}

function PlanCard({
  id,
  interval,
  organizationSlug,
  online,
  canChange,
  hasProfile,
  gstRate,
  current,
  limits,
  overages,
}: Props & { id: PaidPlanId; interval: BillingInterval }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const plan = PLANS[id];
  const price = planPrice(id, interval);
  const isCurrent = current?.plan === id && current.interval === interval;
  const scheduled = current?.scheduled?.plan === id && current.scheduled.interval === interval;
  const over = overages[id];
  const upgrade = current ? isUpgrade(current, { plan: id, interval }) : true;
  const blocked = over.length > 0 && !(current && upgrade);
  const l = limits[id];

  const subscribe = () =>
    startTransition(async () => {
      const started = await startPlanCheckout({ organizationSlug, plan: id, interval });
      if (!started.ok) {
        toast.error(started.error.message);
        return;
      }
      try {
        await loadCheckout();
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Couldn't open the payment window.");
        return;
      }
      await new Promise<void>((resolve) => {
        const checkout = new window.Razorpay!({
          key: started.data.keyId,
          subscription_id: started.data.subscriptionId,
          name: "Shopverse",
          description: started.data.description,
          prefill: { email: started.data.email },
          theme: { color: "#1d6b5c" },
          handler: async (r: {
            razorpay_payment_id: string;
            razorpay_subscription_id: string;
            razorpay_signature: string;
          }) => {
            const confirmed = await confirmPlanCheckout({
              organizationSlug,
              subscriptionId: r.razorpay_subscription_id,
              paymentId: r.razorpay_payment_id,
              signature: r.razorpay_signature,
            });
            if (confirmed.ok) {
              toast.success(`You're on ${plan.name}. Thank you!`);
              router.refresh();
            } else toast.error(confirmed.error.message);
            resolve();
          },
          modal: { ondismiss: () => resolve() },
        });
        checkout.open();
      });
    });

  const change = async () => {
    const result = await changePlan({ organizationSlug, plan: id, interval });
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(
      result.data.now ? `Switched to ${plan.name}` : `${plan.name} starts at your next renewal`,
    );
    router.refresh();
    return true;
  };

  let action: React.ReactNode;
  if (isCurrent)
    action = <p className="text-sm text-muted-foreground">You&apos;re on this plan.</p>;
  else if (scheduled)
    action = <p className="text-sm text-muted-foreground">Starts at your next renewal.</p>;
  else if (!canChange)
    action = <p className="text-sm text-muted-foreground">Ask an owner to change the plan.</p>;
  else if (!online)
    action = <UpgradeButton planName={plan.name} organizationSlug={organizationSlug} />;
  else if (blocked)
    action = (
      <p className="text-sm text-muted-foreground">
        You use{" "}
        {over.map((o) => `${formatNumber(o.used)} ${NOUN[o.resource] ?? o.resource}`).join(" and ")}
        ; {plan.name} allows {over.map((o) => formatNumber(o.limit)).join(" and ")}.
      </p>
    );
  else if (!current)
    action = (
      <Button className="w-full" onClick={subscribe} disabled={isPending || !hasProfile}>
        {isPending && <Spinner />}
        Choose {plan.name}
      </Button>
    );
  else if (!current.active || current.ending)
    action = (
      <p className="text-sm text-muted-foreground">
        {current.ending
          ? "Your plan is ending; choose again once it has."
          : "Settle the current payment first."}
      </p>
    );
  else
    action = (
      <ConfirmDialog
        destructive={false}
        title={upgrade ? `Switch to ${plan.name} now?` : `Switch to ${plan.name} at renewal?`}
        description={
          upgrade
            ? `Your new limits apply straight away and Razorpay charges for ${plan.name} (${formatMoney(planCharge(price, gstRate), "INR")} ${interval === "yearly" ? "a year" : "a month"}${gstRate ? " incl. GST" : ""}) on your saved payment method.`
            : `You keep your current plan until the end of the period you've paid for, then move to ${plan.name}.`
        }
        confirmLabel={upgrade ? "Upgrade now" : "Schedule the change"}
        onConfirm={change}
        trigger={
          <Button className="w-full" variant={upgrade ? "default" : "outline"}>
            {upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
          </Button>
        }
      />
    );

  return (
    <Card className={cn(isCurrent && "border-primary ring-1 ring-primary")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {plan.name}
          {isCurrent && <Badge>Current</Badge>}
          {scheduled && <Badge variant="secondary">Next</Badge>}
        </CardTitle>
        <CardDescription>{plan.tagline}</CardDescription>
        <p className="pt-2">
          <span className="text-3xl font-semibold tabular-nums">{formatMoney(price, "INR")}</span>
          <span className="text-sm text-muted-foreground">
            {" "}
            / {interval === "yearly" ? "year" : "month"}
            {gstRate ? " + GST" : ""}
          </span>
        </p>
        {interval === "yearly" && (
          <p className="text-xs text-muted-foreground">
            {formatMoney(Math.round(price / 12), "INR")} a month, {12 - YEARLY_MONTHS} months free
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {[
            `${limitText(l.shops)} shop${l.shops === 1 ? "" : "s"}`,
            `${limitText(l.seats)} team seats`,
            `${limitText(l.products)} products`,
            `${limitText(l.warehouses)} warehouse${l.warehouses === 1 ? "" : "s"}`,
            ...plan.extras,
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="mt-auto">{action}</CardFooter>
    </Card>
  );
}
