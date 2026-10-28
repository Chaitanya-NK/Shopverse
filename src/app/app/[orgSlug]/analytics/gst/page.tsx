import { DownloadIcon, InfoIcon, ReceiptTextIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { GstFilters } from "@/features/analytics/components/gst-filters";
import { summariseGst } from "@/features/analytics/gst";
import { computeInvoiceTotals } from "@/features/invoices/tax";
import { getMonthInvoices } from "@/features/analytics/queries";
import { formatMonth, recentMonths, resolveMonth } from "@/features/analytics/ranges";
import { loadGstParams } from "@/features/analytics/search-params";
import { getMonthCreditNotes } from "@/features/returns/queries";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "GST reports" };

type Props = PageProps<"/app/[orgSlug]/analytics/gst">;

export default function GstPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Gst params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const num = "text-right font-mono tabular-nums";

async function Gst({ params, searchParams }: Props) {
  const [{ orgSlug }, filters] = await Promise.all([params, loadGstParams(searchParams)]);
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "analytics.read")) return null;

  const shops = await listShops(organization.id);
  const shop = shops.find((s) => s.id === filters.shop) ?? null;
  const month = resolveMonth(filters.month);
  const [invoices, credits] = await Promise.all([
    getMonthInvoices(organization.id, month, shop?.id ?? null),
    getMonthCreditNotes(organization.id, month, shop?.id ?? null),
  ]);
  const s = summariseGst(
    invoices,
    credits.map((c) => c.document),
  );
  const currency = shop?.currency ?? shops[0]?.currency ?? "INR";
  const money = (n: number) => formatMoney(n, currency);
  const query = { month, shop: shop?.id };
  const download = (report: string, label: string) => (
    <Button variant="outline" size="sm" asChild>
      <a href={routes.orgExport(orgSlug, report, query)} download>
        <DownloadIcon />
        {label}
      </a>
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <GstFilters
          month={month}
          months={recentMonths(24)}
          shops={shops.map((x) => ({ id: x.id, name: x.name }))}
        />
        {s.invoices > 0 && download("gst-invoices", "Invoice register")}
      </div>

      <Alert>
        <InfoIcon />
        <AlertTitle>Built from the invoices you issued in {formatMonth(month)}</AlertTitle>
        <AlertDescription>
          Every buyer is treated as unregistered (B2C), and delivery charges carry the item&apos;s
          GST rate, exactly as on the invoices. Credit notes for returns issued in the month are
          taken off. Check the figures with your accountant before filing.
        </AlertDescription>
      </Alert>

      {s.invoices === 0 && s.creditNotes.count === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon />
            </EmptyMedia>
            <EmptyTitle>No invoices in {formatMonth(month)}</EmptyTitle>
            <EmptyDescription>
              Invoices are issued when an order is first picked up or completed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {(s.unregistered > 0 || s.missingHsn > 0) && (
            <Alert className="border-warning-foreground/30 bg-warning text-warning-foreground *:data-[slot=alert-description]:text-warning-foreground/90">
              <TriangleAlertIcon />
              <AlertTitle>Some details are missing</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {s.unregistered > 0 && (
                    <li>
                      {formatNumber(s.unregistered)} invoice
                      {s.unregistered === 1 ? " was" : "s were"} issued without a GSTIN, so they
                      carry no tax. Add the GSTIN in{" "}
                      <Link className="underline" href={routes.orgShops(orgSlug)}>
                        shop settings
                      </Link>
                      .
                    </li>
                  )}
                  {s.missingHsn > 0 && (
                    <li>
                      {formatNumber(s.missingHsn)} invoice line
                      {s.missingHsn === 1 ? " has" : "s have"} no HSN code. Add HSN codes on your{" "}
                      <Link className="underline" href={routes.orgProducts(orgSlug)}>
                        products
                      </Link>{" "}
                      so new invoices carry them.
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Invoices",
                formatNumber(s.invoices),
                s.firstNumber === s.lastNumber
                  ? s.firstNumber
                  : `${s.firstNumber} to ${s.lastNumber}`,
              ],
              [
                "Taxable value",
                money(s.totals.taxable),
                s.creditNotes.count > 0
                  ? `Before GST, after discounts and ${s.creditNotes.count} credit note${s.creditNotes.count === 1 ? "" : "s"}`
                  : "Before GST, after discounts",
              ],
              [
                "GST",
                money(s.totals.cgst + s.totals.sgst + s.totals.igst),
                `CGST ${money(s.totals.cgst)} · SGST ${money(s.totals.sgst)} · IGST ${money(s.totals.igst)}`,
              ],
              [
                "Net value",
                money(s.totals.value),
                s.creditNotes.count > 0
                  ? `Billed, less ${money(s.creditNotes.totals.value)} credited for returns`
                  : "What customers were billed",
              ],
            ].map(([label, value, hint]) => (
              <Card key={label} className="gap-2">
                <CardHeader>
                  <CardDescription>
                    <dt>{label}</dt>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <dd className="font-mono text-2xl font-semibold tabular-nums">{value}</dd>
                  <dd className="text-xs text-muted-foreground">{hint}</dd>
                </CardContent>
              </Card>
            ))}
          </dl>

          <Card>
            <CardHeader>
              <CardTitle>B2C supplies by place of supply</CardTitle>
              <CardDescription>
                Grouped by the buyer&apos;s state and the GST rate, for the B2C section of GSTR-1.
              </CardDescription>
              <CardAction>{download("gst-b2c", "CSV")}</CardAction>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Place of supply</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Taxable value</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.b2c.map((r) => (
                    <TableRow key={`${r.placeOfSupply}-${r.rate}`}>
                      <TableCell>
                        {r.stateCode && (
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {r.stateCode}
                          </span>
                        )}
                        {r.placeOfSupply}
                      </TableCell>
                      <TableCell className={num}>{r.rate}%</TableCell>
                      <TableCell className={num}>{formatNumber(r.invoices)}</TableCell>
                      <TableCell className={num}>{money(r.taxable)}</TableCell>
                      <TableCell className={num}>{money(r.cgst)}</TableCell>
                      <TableCell className={num}>{money(r.sgst)}</TableCell>
                      <TableCell className={num}>{money(r.igst)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className={num}>{money(s.totals.taxable)}</TableCell>
                    <TableCell className={num}>{money(s.totals.cgst)}</TableCell>
                    <TableCell className={num}>{money(s.totals.sgst)}</TableCell>
                    <TableCell className={num}>{money(s.totals.igst)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {credits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Credit notes</CardTitle>
                <CardDescription>
                  Issued for returns this month: {s.creditNotes.firstNumber}
                  {s.creditNotes.count > 1 && ` to ${s.creditNotes.lastNumber}`}. Already taken off
                  the tables above.
                </CardDescription>
                <CardAction>{download("gst-credit-notes", "CSV")}</CardAction>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Credit note</TableHead>
                      <TableHead>Against invoice</TableHead>
                      <TableHead>Place of supply</TableHead>
                      <TableHead className="text-right">Taxable value</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credits.map(({ document: doc, creditNote }) => {
                      const t = computeInvoiceTotals(doc);
                      return (
                        <TableRow key={doc.number}>
                          <TableCell className="font-mono">{doc.number}</TableCell>
                          <TableCell className="font-mono">{creditNote.againstNumber}</TableCell>
                          <TableCell>{t.placeOfSupply ?? "—"}</TableCell>
                          <TableCell className={num}>{money(t.taxable)}</TableCell>
                          <TableCell className={num}>{money(t.cgst + t.sgst + t.igst)}</TableCell>
                          <TableCell className={num}>{money(t.total)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className={num}>{money(s.creditNotes.totals.taxable)}</TableCell>
                      <TableCell className={num}>
                        {money(
                          s.creditNotes.totals.cgst +
                            s.creditNotes.totals.sgst +
                            s.creditNotes.totals.igst,
                        )}
                      </TableCell>
                      <TableCell className={num}>{money(s.creditNotes.totals.value)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>HSN summary</CardTitle>
              <CardDescription>
                Quantities and values by HSN code and rate. Delivery is listed on its own line.
              </CardDescription>
              <CardAction>{download("gst-hsn", "CSV")}</CardAction>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HSN</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Taxable value</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Total value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.hsn.map((r) => (
                    <TableRow key={`${r.hsnCode ?? r.description}-${r.rate}`}>
                      <TableCell className="font-mono">
                        {r.hsnCode ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-64 truncate">{r.description}</TableCell>
                      <TableCell className={num}>{r.rate}%</TableCell>
                      <TableCell className={num}>
                        {r.quantity ? formatNumber(r.quantity) : "—"}
                      </TableCell>
                      <TableCell className={num}>{money(r.taxable)}</TableCell>
                      <TableCell className={num}>{money(r.cgst + r.sgst + r.igst)}</TableCell>
                      <TableCell className={num}>{money(r.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
