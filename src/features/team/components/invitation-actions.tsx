"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type OrgRole } from "@/features/organizations/permissions";
import { inviteMember, revokeInvitation } from "@/features/team/actions";
import { type INVITABLE_ROLES } from "@/features/team/schemas";

/** Resend (new link, new expiry) or revoke a pending invitation. */
export function InvitationActions({
  organizationSlug,
  invitation,
}: {
  organizationSlug: string;
  invitation: { id: string; email: string; role: OrgRole; allShops: boolean; shopIds: string[] };
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await inviteMember({
              organizationSlug,
              email: invitation.email,
              role: invitation.role as (typeof INVITABLE_ROLES)[number],
              allShops: invitation.allShops,
              shopIds: invitation.shopIds,
            });
            if (!result.ok) toast.error(result.error.message);
            else
              toast.success(
                result.data.emailed ? `Sent a new link to ${invitation.email}` : "New link created",
              );
          })
        }
      >
        {isPending && <Spinner />}
        Resend
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await revokeInvitation({
              organizationSlug,
              invitationId: invitation.id,
            });
            if (!result.ok) toast.error(result.error.message);
            else toast.success(`Invitation to ${invitation.email} revoked`);
          })
        }
      >
        Revoke
      </Button>
    </div>
  );
}
