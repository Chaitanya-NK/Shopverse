import { Suspense } from "react";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { ModeToggle } from "@/components/shared/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ShopSwitcher } from "@/features/shops/components/shop-switcher";
import { listShops } from "@/features/shops/queries";
import { listMyMemberships, requireMembership } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/session";

/**
 * Workspace shell. The frame renders immediately; everything that depends on
 * the session or the URL streams in behind Suspense boundaries.
 */
export default function OrganizationLayout({ children, params }: LayoutProps<"/app/[orgSlug]">) {
  return (
    <SidebarProvider>
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarLoader params={params} />
      </Suspense>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<Skeleton className="h-8 w-44" />}>
              <ShopSwitcherLoader params={params} />
            </Suspense>
            <ModeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function SidebarLoader({ params }: Pick<LayoutProps<"/app/[orgSlug]">, "params">) {
  const { orgSlug } = await params;
  const [user, memberships] = await Promise.all([requireUser(), listMyMemberships()]);
  await requireMembership(orgSlug);

  return (
    <AppSidebar
      orgSlug={orgSlug}
      user={{ name: user.fullName ?? user.email, email: user.email }}
      workspaces={memberships.map((m) => ({
        slug: m.organization.slug,
        name: m.organization.name,
        plan: m.organization.plan,
        role: m.role,
      }))}
    />
  );
}

async function ShopSwitcherLoader({ params }: Pick<LayoutProps<"/app/[orgSlug]">, "params">) {
  const { orgSlug } = await params;
  const membership = await requireMembership(orgSlug);
  const shops = await listShops(membership.organization.id);
  return <ShopSwitcher shops={shops.map((s) => ({ slug: s.slug, name: s.name }))} />;
}

function SidebarSkeleton() {
  return (
    <div className="hidden w-(--sidebar-width) shrink-0 bg-sidebar md:block" aria-hidden="true" />
  );
}
