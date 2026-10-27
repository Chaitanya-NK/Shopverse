import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/shared/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";
import { listMyMemberships } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up your workspace" };

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="mx-auto flex max-w-2xl items-center px-6 py-6">
        <Logo href={routes.app} />
      </header>
      <main className="mx-auto max-w-2xl space-y-8 px-6 pb-16">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Set up your workspace</h1>
          <p className="text-muted-foreground">
            Three quick details and you&apos;re in. Everything here can be changed later.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-xl" />}>
          <OnboardingContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function OnboardingContent({ searchParams }: Pick<PageProps<"/onboarding">, "searchParams">) {
  const [user, memberships, params] = await Promise.all([
    requireUser(routes.onboarding),
    listMyMemberships(),
    searchParams,
  ]);

  // Existing customers land in their workspace unless they explicitly add another.
  const first = memberships[0];
  if (first && params.new !== "1") {
    redirect(routes.org(first.organization.slug));
  }

  const firstName = user.fullName?.split(" ")[0];
  return <OnboardingForm defaultName={firstName ? `${firstName}'s Store` : undefined} />;
}
