import { ArrowLeftIcon, PlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
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
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { SupplierDialog } from "@/features/purchasing/components/supplier-dialog";
import { listSuppliers } from "@/features/purchasing/queries";

export const metadata: Metadata = { title: "Suppliers" };

type Props = PageProps<"/app/[orgSlug]/purchasing/suppliers">;

export default function SuppliersPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Suppliers params={params} />
    </Suspense>
  );
}

async function Suppliers({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  const suppliers = await listSuppliers(organization.id);
  const canManage = can(role, "purchasing.manage");
  const add = canManage && (
    <SupplierDialog
      organizationSlug={orgSlug}
      trigger={
        <Button>
          <PlusIcon />
          New supplier
        </Button>
      }
    />
  );

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgPurchasing(orgSlug)}>
            <ArrowLeftIcon />
            Purchasing
          </Link>
        </Button>
        <PageHeader
          title="Suppliers"
          description="The businesses you buy stock from."
          actions={suppliers.length > 0 ? add : undefined}
        />
      </div>
      {suppliers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No suppliers yet</EmptyTitle>
            <EmptyDescription>Add the wholesalers and brands you order from.</EmptyDescription>
          </EmptyHeader>
          {add && <EmptyContent>{add}</EmptyContent>}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {s.name}
                      {!s.isActive && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[s.address.city, s.address.state].filter(Boolean).join(", ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.gstin ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {[
                      s.paymentTerms,
                      s.leadTimeDays !== null ? `${s.leadTimeDays} days to deliver` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <SupplierDialog
                        organizationSlug={orgSlug}
                        supplier={s}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
