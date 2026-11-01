import {
  DownloadIcon,
  IndianRupeeIcon,
  MailIcon,
  MailPlusIcon,
  RotateCcwIcon,
  ShoppingCartIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { CartReminderForm } from "@/features/marketing/components/cart-reminder-form";
import { RemoveSubscriberButton } from "@/features/marketing/components/remove-subscriber-button";
import {
  getCartRecoveryStats,
  listCartRecoveries,
  listNewsletterSubscribers,
} from "@/features/marketing/queries";
import { CART_STATUS_LABELS } from "@/features/marketing/schemas";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Marketing" };

type Props = PageProps<"/app/[orgSlug]/marketing">;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default function MarketingPage({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Marketing"
        description="Win back shoppers who leave without ordering, and grow your mailing list."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Marketing params={params} />
      </Suspense>
    </>
  );
}

async function Marketing({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "marketing.manage"))
    return (
      <p className="text-sm text-muted-foreground">
        Only owners, admins and managers can see marketing.
      </p>
    );
  const [stats, carts, shops, subscribers] = await Promise.all([
    getCartRecoveryStats(organization.id),
    listCartRecoveries(organization.id),
    listShops(organization.id),
    listNewsletterSubscribers(organization.id),
  ]);
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const anyOn = shops.some((s) => s.cartReminders.enabled);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Carts left behind"
          value={formatNumber(stats.abandoned)}
          hint="Last 30 days"
          icon={ShoppingCartIcon}
        />
        <StatCard
          label="Reminders sent"
          value={formatNumber(stats.reminded)}
          hint={`${formatNumber(stats.clicked)} opened their cart`}
          icon={MailIcon}
        />
        <StatCard
          label="Recovered orders"
          value={formatNumber(stats.recovered)}
          hint={
            stats.reminded
              ? `${Math.round((stats.recovered / stats.reminded) * 100)}% of reminders`
              : "After a reminder"
          }
          icon={RotateCcwIcon}
        />
        <StatCard
          label="Recovered sales"
          value={formatMoney(stats.recoveredTotal, "INR")}
          hint="From reminded carts"
          icon={IndianRupeeIcon}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cart reminders</CardTitle>
          <CardDescription>
            One email to shoppers who entered their email at checkout, or were signed in, and
            didn&apos;t order. It links straight back to their cart. Sent by the scheduler (see
            Alerts &amp; shipping).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {shops.map((s) => (
            <CartReminderForm
              key={s.id}
              organizationSlug={orgSlug}
              shop={{ id: s.id, name: s.name, reminders: s.cartReminders }}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent carts</CardTitle>
          <CardDescription>The 50 most recent.</CardDescription>
        </CardHeader>
        <CardContent>
          {carts.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShoppingCartIcon />
                </EmptyMedia>
                <EmptyTitle>No carts yet</EmptyTitle>
                <EmptyDescription>
                  {anyOn
                    ? "Carts appear here when shoppers start checkout and don't finish."
                    : "Turn on reminders above; carts appear as shoppers start checkout."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shopper</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name ?? c.email}</div>
                        {c.name && <div className="text-xs text-muted-foreground">{c.email}</div>}
                      </TableCell>
                      <TableCell>{shopName.get(c.shopId) ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.units}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(c.subtotal, "INR")}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {timeFormat.format(new Date(c.lastActivityAt))}
                      </TableCell>
                      <TableCell>
                        {c.status === "recovered" && c.recoveredOrderId ? (
                          <Link href={routes.orgOrder(orgSlug, c.recoveredOrderId)}>
                            <Badge>{CART_STATUS_LABELS.recovered}</Badge>
                          </Link>
                        ) : (
                          <Badge variant={c.status === "reminded" ? "secondary" : "outline"}>
                            {CART_STATUS_LABELS[c.status]}
                            {c.status === "reminded" && c.clickedAt ? " · opened" : ""}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Newsletter sign-ups</CardTitle>
            <CardDescription>
              {formatNumber(subscribers.total)} from the Newsletter sections in your shops&apos;
              designs. Download them for your email tool.
            </CardDescription>
          </div>
          {subscribers.total > 0 && (
            <Button asChild variant="outline" size="sm">
              <a href={routes.orgMarketingSubscribersCsv(orgSlug)} download>
                <DownloadIcon />
                Download CSV
              </a>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {subscribers.items.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MailPlusIcon />
                </EmptyMedia>
                <EmptyTitle>No sign-ups yet</EmptyTitle>
                <EmptyDescription>
                  Add a Newsletter sign-up section to a shop in Shops → Design.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.email}</TableCell>
                      <TableCell>{shopName.get(s.shopId) ?? "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {timeFormat.format(new Date(s.createdAt))}
                      </TableCell>
                      <TableCell>
                        <RemoveSubscriberButton
                          organizationSlug={orgSlug}
                          id={s.id}
                          email={s.email}
                        />
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
  );
}
