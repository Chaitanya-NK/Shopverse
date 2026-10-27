import { ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SimplePagination } from "@/components/shared/simple-pagination";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { AuditFilters } from "@/features/audit/components/audit-filters";
import { AUDIT_ENTITY_LABELS, describeAudit } from "@/features/audit/describe";
import { listAudit } from "@/features/audit/queries";
import { loadAuditParams, serializeAuditParams } from "@/features/audit/search-params";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listTeam } from "@/features/team/queries";

export const metadata: Metadata = { title: "Audit log" };

type Props = PageProps<"/app/[orgSlug]/team/audit">;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default function AuditPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Audit params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadAuditParams(searchParams);
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "audit.read")) notFound();

  const [result, team] = await Promise.all([
    listAudit(organization.id, filters),
    listTeam(organization.id),
  ]);

  return (
    <div className="space-y-6">
      <AuditFilters
        people={team.map((m) => ({ id: m.userId, name: m.name ?? m.email ?? "Member" }))}
      />
      {result.items.length > 0 ? (
        <>
          <ol className="divide-y rounded-xl border">
            {result.items.map((entry) => {
              const { summary, details } = describeAudit(entry.action, entry.metadata);
              return (
                <li
                  key={entry.id}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
                >
                  <time
                    className="text-xs text-muted-foreground tabular-nums sm:pt-0.5"
                    dateTime={entry.createdAt}
                  >
                    {timeFormat.format(new Date(entry.createdAt))}
                  </time>
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{entry.actorName ?? "System"}</span>
                      <span>{summary.charAt(0).toLowerCase() + summary.slice(1)}</span>
                      <Badge variant="outline" className="font-normal">
                        {AUDIT_ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                      </Badge>
                    </p>
                    {details.length > 0 && (
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={details.join(", ")}
                      >
                        {details.join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "entry" : "entries"}
            hrefFor={(page) =>
              routes.orgAudit(orgSlug) + serializeAuditParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollTextIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing recorded</EmptyTitle>
            <EmptyDescription>No activity matches these filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
