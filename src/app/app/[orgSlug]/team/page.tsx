import type { Metadata } from "next";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, ROLE_LABELS } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { InvitationActions } from "@/features/team/components/invitation-actions";
import { InviteMemberDialog } from "@/features/team/components/invite-member-dialog";
import { MemberActions } from "@/features/team/components/member-actions";
import { listInvitations, listTeam } from "@/features/team/queries";
import { roleHasAllShops } from "@/features/team/schemas";
import { requireUser } from "@/lib/auth/session";
import { initials } from "@/lib/format";

export const metadata: Metadata = { title: "Team" };

type Props = PageProps<"/app/[orgSlug]/team">;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default function TeamPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const [{ organization, role }, user] = await Promise.all([
    requireMembership(orgSlug),
    requireUser(),
  ]);
  const canManage = can(role, "members.manage");
  const [members, invitations, shops] = await Promise.all([
    listTeam(organization.id),
    canManage ? listInvitations(organization.id) : Promise.resolve([]),
    listShops(organization.id),
  ]);
  const shopOptions = shops.map((s) => ({ id: s.id, name: s.name }));
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const isOwner = role === "owner";
  const access = (m: {
    role: (typeof members)[number]["role"];
    allShops: boolean;
    shopIds: string[];
  }) =>
    roleHasAllShops(m.role) || m.allShops
      ? "All shops"
      : m.shopIds
          .map((id) => shopName.get(id))
          .filter(Boolean)
          .join(", ") || "No shops";

  return (
    <div className="space-y-6">
      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "person" : "people"}
          </CardDescription>
          {canManage && (
            <CardAction>
              <InviteMemberDialog organizationSlug={orgSlug} shops={shopOptions} />
            </CardAction>
          )}
        </CardHeader>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-6">Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Shops</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead className="w-12 pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const label = m.name ?? m.email ?? "Member";
                const isSelf = m.userId === user.id;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {initials(label)}
                        </span>
                        <span className="grid min-w-0">
                          <span className="truncate font-medium">
                            {label}
                            {isSelf && (
                              <span className="font-normal text-muted-foreground"> (you)</span>
                            )}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                        {ROLE_LABELS[m.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
                      {access(m)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {dateFormat.format(new Date(m.joinedAt))}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <MemberActions
                        organizationSlug={orgSlug}
                        member={{
                          id: m.id,
                          label,
                          role: m.role,
                          allShops: m.allShops,
                          shopIds: m.shopIds,
                        }}
                        shops={shopOptions}
                        isSelf={isSelf}
                        canManage={canManage && (m.role !== "owner" || isOwner)}
                        viewerIsOwner={isOwner}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canManage && invitations.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="py-5">
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              Links expire after 7 days. Resending creates a fresh link.
            </CardDescription>
          </CardHeader>
          <div className="overflow-x-auto border-t">
            <Table>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="pl-6">
                      <span className="font-medium">{inv.email}</span>
                      <span className="block text-xs text-muted-foreground">
                        {ROLE_LABELS[inv.role]} · {access(inv)} · expires{" "}
                        {dateFormat.format(new Date(inv.expiresAt))}
                      </span>
                    </TableCell>
                    <TableCell className="pr-6">
                      <InvitationActions organizationSlug={orgSlug} invitation={inv} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
