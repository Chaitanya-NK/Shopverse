import { BugIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
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
import { ERROR_STATUSES, type ErrorStatus, listErrors } from "@/features/admin/health";
import { SOURCE_LABELS, timeFormat } from "@/features/admin/health-labels";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Errors" };

export default function ErrorsPage({ searchParams }: PageProps<"/admin/errors">) {
  return (
    <>
      <PageHeader
        title="Errors"
        description="Unexpected errors from servers, browsers and background jobs, grouped by cause."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Errors searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Errors({ searchParams }: Pick<PageProps<"/admin/errors">, "searchParams">) {
  const raw = (await searchParams).status;
  const status: ErrorStatus = raw === "resolved" || raw === "all" ? raw : "open";
  await connection();
  const result = await listErrors(status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter errors" className="flex gap-1">
          {(Object.keys(ERROR_STATUSES) as ErrorStatus[]).map((s) => (
            <Link
              key={s}
              href={s === "open" ? routes.adminErrors : `${routes.adminErrors}?status=${s}`}
              aria-current={s === status ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                s === status
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ERROR_STATUSES[s]}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-muted-foreground">
          {formatNumber(result.open)} open · {formatNumber(result.last_24h)} in the last 24 hours
        </p>
      </div>
      {result.groups.length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BugIcon />
            </EmptyMedia>
            <EmptyTitle>{status === "open" ? "No open errors" : "Nothing here"}</EmptyTitle>
            <EmptyDescription>Errors appear here as they happen.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Error</TableHead>
                <TableHead>Where</TableHead>
                <TableHead className="text-right">Times</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.groups.map((g) => (
                <TableRow key={g.fingerprint}>
                  <TableCell className="max-w-xl">
                    <Link
                      href={routes.adminError(g.fingerprint)}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {g.message}
                    </Link>
                    {g.resolved_at && <Badge variant="outline">Resolved</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{SOURCE_LABELS[g.source]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(g.count)}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {timeFormat.format(new Date(g.last_seen))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
