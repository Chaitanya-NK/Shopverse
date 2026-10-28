import { BarChart3Icon } from "lucide-react";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/shared/section-tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";

type Props = LayoutProps<"/app/[orgSlug]/analytics">;

export default function AnalyticsLayout({ params, children }: Props) {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="How your shops are selling, and the GST summaries for your returns."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Gate params={params}>{children}</Gate>
      </Suspense>
    </>
  );
}

async function Gate({ params, children }: Props) {
  const { orgSlug } = await params;
  const { role } = await requireMembership(orgSlug);
  if (!can(role, "analytics.read")) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3Icon />
          </EmptyMedia>
          <EmptyTitle>Reports are for owners, admins and managers</EmptyTitle>
          <EmptyDescription>Ask an owner or admin if you need sales figures.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <SectionTabs
        label="Analytics sections"
        tabs={[
          { href: routes.orgAnalytics(orgSlug), label: "Sales" },
          { href: routes.orgGstReports(orgSlug), label: "GST reports" },
        ]}
      />
      {children}
    </>
  );
}
