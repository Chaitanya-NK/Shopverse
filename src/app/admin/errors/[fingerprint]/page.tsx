import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { ResolveErrorButton } from "@/features/admin/components/health-buttons";
import { getError } from "@/features/admin/health";
import { SOURCE_LABELS, timeFormat } from "@/features/admin/health-labels";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Error" };

type Props = PageProps<"/admin/errors/[fingerprint]">;

export default function ErrorPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ErrorDetail params={params} />
    </Suspense>
  );
}

async function ErrorDetail({ params }: Pick<Props, "params">) {
  const { fingerprint } = await params;
  await connection();
  const group = await getError(fingerprint);
  if (!group) notFound();
  const latest = group.events[0];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href={routes.adminErrors}>
          <ArrowLeftIcon />
          Errors
        </Link>
      </Button>
      <PageHeader
        title={group.message}
        description={`${SOURCE_LABELS[group.source]} · ${formatNumber(group.count)} time${group.count === 1 ? "" : "s"} · first ${timeFormat.format(new Date(group.first_seen))}, last ${timeFormat.format(new Date(group.last_seen))}`}
        actions={
          <ResolveErrorButton
            fingerprint={group.fingerprint}
            resolved={Boolean(group.resolved_at)}
          />
        }
      />
      {latest?.stack && (
        <Card>
          <CardHeader>
            <CardTitle>Latest stack trace</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">
              {latest.stack}
            </pre>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Recent occurrences</CardTitle>
          <CardDescription>The latest {group.events.length} are kept.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border text-sm">
            {group.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="whitespace-nowrap text-muted-foreground">
                  {timeFormat.format(new Date(e.created_at))}
                </span>
                {e.method && <Badge variant="outline">{e.method}</Badge>}
                <code className="text-xs">{e.path ?? "—"}</code>
                {e.request_id && (
                  <span className="text-xs text-muted-foreground">request {e.request_id}</span>
                )}
                {e.digest && <span className="text-xs text-muted-foreground">ref {e.digest}</span>}
                {Object.keys(e.context).length > 0 && (
                  <code className="basis-full text-xs break-all text-muted-foreground">
                    {JSON.stringify(e.context)}
                  </code>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
