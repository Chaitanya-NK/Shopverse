import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/shared/section-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";

export default function TeamLayout({ params, children }: LayoutProps<"/app/[orgSlug]/team">) {
  return (
    <>
      <PageHeader
        title="Team & security"
        description="Who can do what, and a record of what they did."
      />
      <Suspense fallback={<Skeleton className="h-10 w-64" />}>
        <Tabs params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function Tabs({ params }: Pick<LayoutProps<"/app/[orgSlug]/team">, "params">) {
  const { orgSlug } = await params;
  const { role } = await requireMembership(orgSlug);
  const tabs = [{ href: routes.orgTeam(orgSlug), label: "Members" }];
  if (can(role, "audit.read")) tabs.push({ href: routes.orgAudit(orgSlug), label: "Audit log" });
  return <SectionTabs label="Team sections" tabs={tabs} />;
}
