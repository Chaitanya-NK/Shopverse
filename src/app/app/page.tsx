import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { listMyMemberships } from "@/features/organizations/queries";

/** /app: send the user to their workspace, or to onboarding if they have none. */
export default function AppIndexPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <Spinner className="size-6" />
        </div>
      }
    >
      <ResolveWorkspace />
    </Suspense>
  );
}

async function ResolveWorkspace(): Promise<never> {
  const memberships = await listMyMemberships();
  const first = memberships[0];
  redirect(first ? routes.org(first.organization.slug) : routes.onboarding);
}
