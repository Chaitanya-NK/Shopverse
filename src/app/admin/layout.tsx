import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/shared/logo";
import { ModeToggle } from "@/components/shared/mode-toggle";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { requirePlatformAdmin } from "@/features/admin/queries";

export const metadata: Metadata = {
  title: { default: "Shopverse admin", template: "%s · Shopverse admin" },
  robots: { index: false, follow: false },
};

/** Shopverse's own console: every business, plans and invoices. Platform admins only. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:px-8">
          <Logo href={routes.admin} />
          <Badge variant="secondary">Admin</Badge>
          <Suspense fallback={<div className="h-8 w-48" />}>
            <AdminNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={<Skeleton className="h-4 w-40" />}>
              <Who />
            </Suspense>
            <Link href={routes.app} className="text-sm text-muted-foreground hover:text-foreground">
              Back to app
            </Link>
            <ModeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-8">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <Gate>{children}</Gate>
        </Suspense>
      </main>
    </div>
  );
}

async function Who() {
  const user = await requirePlatformAdmin();
  return <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>;
}

async function Gate({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return <>{children}</>;
}
