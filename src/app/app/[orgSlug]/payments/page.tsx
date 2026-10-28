import { AlertTriangleIcon, LandmarkIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { env } from "@/env";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import {
  CopyField,
  PaymentSettingsForm,
} from "@/features/payments/components/payment-settings-form";
import { getPaymentSettings } from "@/features/payments/queries";

export const metadata: Metadata = { title: "Payments" };

type Props = PageProps<"/app/[orgSlug]/payments">;

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];

export default function PaymentsPage({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Payments"
        description="Take card and other online payments in your shops with your own Stripe account."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Payments params={params} />
      </Suspense>
    </>
  );
}

async function Payments({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "payments.manage"))
    return (
      <p className="text-sm text-muted-foreground">Only owners and admins can manage payments.</p>
    );

  const settings = await getPaymentSettings(organization.id);
  const webhookUrl = new URL(
    routes.stripeWebhook(organization.id),
    env.NEXT_PUBLIC_APP_URL,
  ).toString();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <LandmarkIcon className="size-5" aria-hidden />
            Stripe
            {settings.connected ? (
              <>
                <Badge variant={settings.mode === "live" ? "default" : "secondary"}>
                  {settings.mode === "live" ? "Live" : "Test mode"}
                </Badge>
                {!settings.enabled && <Badge variant="outline">Paused</Badge>}
              </>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Money goes straight to your Stripe account. Keys are checked with Stripe, then stored
            encrypted; nobody can read them back here.
            {settings.connected && (
              <span className="mt-1 block">
                Connected account: <code className="text-xs">{settings.key_id}</code>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!env.PAYMENTS_ENCRYPTION_KEY && (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>The server isn&apos;t ready for payments</AlertTitle>
              <AlertDescription>
                Set PAYMENTS_ENCRYPTION_KEY (32 random bytes, base64) in the server environment,
                then restart. See the README.
              </AlertDescription>
            </Alert>
          )}
          {settings.connected && !settings.webhook_configured && (
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>Add the webhook</AlertTitle>
              <AlertDescription>
                Without it, a payment made just as the shopper closes the page is only noticed when
                they come back.
              </AlertDescription>
            </Alert>
          )}
          <PaymentSettingsForm organizationSlug={orgSlug} settings={settings} />
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Set up in Stripe</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-4 pl-5 text-sm">
            <li>
              Sign up at stripe.com (any country; test mode needs no documents). In{" "}
              <b>Developers → API keys</b>, copy the <b>secret key</b> and paste it here.
            </li>
            <li className="space-y-2">
              <p>
                In <b>Developers → Webhooks → Add endpoint</b>, use this URL:
              </p>
              <CopyField value={webhookUrl} label="webhook URL" />
              <p>
                Select these events, then copy the endpoint&apos;s <b>signing secret</b> here:{" "}
                {WEBHOOK_EVENTS.map((e, i) => (
                  <span key={e}>
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{e}</code>
                    {i < WEBHOOK_EVENTS.length - 1 ? ", " : "."}
                  </span>
                ))}
              </p>
            </li>
            <li>
              Choose which shops take online payments in each shop&apos;s settings. Unpaid online
              orders hold stock for 30 minutes.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
