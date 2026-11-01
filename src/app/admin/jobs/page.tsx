import { CheckCircle2Icon, ClockIcon, LoaderIcon, SkullIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
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
import { RetryJobButton } from "@/features/admin/components/health-buttons";
import { getJobs } from "@/features/admin/health";
import { JOB_LABELS, timeFormat } from "@/features/admin/health-labels";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Background jobs" };

export default function JobsPage() {
  return (
    <>
      <PageHeader
        title="Background jobs"
        description="Emails, WhatsApp/SMS updates and Stripe events are sent from a queue and retried when they fail."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Jobs />
      </Suspense>
    </>
  );
}

async function Jobs() {
  await connection();
  const jobs = await getJobs();
  const stale =
    jobs.oldest_due &&
    Date.parse(jobs.oldest_due) < Date.parse(new Date().toISOString()) - 10 * 60_000;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Waiting"
          value={formatNumber(jobs.counts.queued)}
          hint={jobs.counts.due ? `${formatNumber(jobs.counts.due)} due now` : "Nothing due"}
          icon={ClockIcon}
        />
        <StatCard
          label="Running"
          value={formatNumber(jobs.counts.running)}
          hint="Right now"
          icon={LoaderIcon}
        />
        <StatCard
          label="Done"
          value={formatNumber(jobs.counts.done_24h)}
          hint="Last 24 hours"
          icon={CheckCircle2Icon}
        />
        <StatCard
          label="Failed for good"
          value={formatNumber(jobs.counts.dead)}
          hint="Retry below"
          icon={SkullIcon}
        />
      </div>
      {stale && (
        <p role="alert" className="rounded-lg border border-warning bg-warning/10 p-3 text-sm">
          Jobs have been waiting more than 10 minutes. Check that the scheduler calls
          /api/cron/jobs.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Failing and failed</CardTitle>
          <CardDescription>
            Jobs that failed at least once. They retry on their own (30 seconds, then doubling up to
            an hour); after the last attempt they stop here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.problems.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCircle2Icon />
                </EmptyMedia>
                <EmptyTitle>All clear</EmptyTitle>
                <EmptyDescription>No job is failing.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last error</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="w-24">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.problems.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>
                        <div className="font-medium">{JOB_LABELS[j.kind] ?? j.kind}</div>
                        <div className="text-xs text-muted-foreground">#{j.id}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={j.status === "dead" ? "destructive" : "secondary"}>
                          {j.status === "dead" ? "Failed" : "Retrying"} · {j.attempts}/
                          {j.max_attempts}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-sm break-words text-muted-foreground">
                        {j.last_error}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {j.status === "dead"
                          ? timeFormat.format(new Date(j.finished_at ?? j.created_at))
                          : `next ${timeFormat.format(new Date(j.run_after))}`}
                      </TableCell>
                      <TableCell>
                        <RetryJobButton id={j.id} kind={j.kind} />
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
