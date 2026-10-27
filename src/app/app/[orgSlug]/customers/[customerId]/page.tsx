import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  CalendarIcon,
  MailIcon,
  PhoneIcon,
  ReceiptIcon,
  ShoppingBagIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { getCustomer } from "@/features/customers/queries";
import { OrdersTable } from "@/features/orders/components/orders-table";
import { listCustomerOrders } from "@/features/orders/queries";
import { requireMembership } from "@/features/organizations/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Customer" };

type Props = PageProps<"/app/[orgSlug]/customers/[customerId]">;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default function CustomerPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Customer params={params} />
    </Suspense>
  );
}

async function Customer({ params }: Pick<Props, "params">) {
  const { orgSlug, customerId } = await params;
  if (!z.uuid().safeParse(customerId).success) notFound();
  const { organization } = await requireMembership(orgSlug);
  const customer = await getCustomer(organization.id, customerId);
  if (!customer) notFound();
  const orders = await listCustomerOrders(organization.id, customer.id);
  const currency = orders[0]?.currency ?? "INR";
  const avg = customer.ordersCount ? customer.totalSpent / customer.ordersCount : 0;

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgCustomers(orgSlug)}>
            <ArrowLeftIcon />
            Customers
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {customer.name ?? customer.email ?? customer.phone}
        </h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <MailIcon className="size-3.5" aria-hidden />
              {customer.email}
              {customer.verified && (
                <BadgeCheckIcon className="size-3.5 text-emerald-600" aria-label="Verified" />
              )}
            </a>
          )}
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <PhoneIcon className="size-3.5" aria-hidden />
              {customer.phone}
            </a>
          )}
          <span>Customer since {dateFormat.format(new Date(customer.createdAt))}</span>
          <span>
            {customer.lastSignInAt
              ? `Has an account · last signed in ${dateFormat.format(new Date(customer.lastSignInAt))}`
              : "Guest (no account)"}
          </span>
        </p>
      </div>
      <StatGrid
        columns={3}
        stats={[
          {
            label: "Orders",
            value: String(customer.ordersCount),
            hint: "Not counting cancelled",
            icon: ShoppingBagIcon,
          },
          {
            label: "Total spent",
            value: formatMoney(customer.totalSpent, currency),
            hint: `Average ${formatMoney(avg, currency)}`,
            icon: ReceiptIcon,
          },
          {
            label: "Last order",
            value: customer.lastOrderAt ? dateFormat.format(new Date(customer.lastOrderAt)) : "—",
            hint: "Most recent purchase",
            icon: CalendarIcon,
          },
        ]}
      />
      {orders.length > 0 && <OrdersTable organizationSlug={orgSlug} orders={orders} showShop />}
    </>
  );
}
