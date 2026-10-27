"use client";

import { LogOutIcon, MoreHorizontalIcon, PencilIcon, UserMinusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { type OrgRole } from "@/features/organizations/permissions";
import { removeMember, updateMember } from "@/features/team/actions";
import { AccessFields } from "@/features/team/components/access-fields";
import { ASSIGNABLE_ROLES, INVITABLE_ROLES } from "@/features/team/schemas";

type MemberActionsProps = {
  organizationSlug: string;
  member: { id: string; label: string; role: OrgRole; allShops: boolean; shopIds: string[] };
  shops: { id: string; name: string }[];
  isSelf: boolean;
  /** Whether the viewer may edit/remove this member (owners for owners, admins for the rest). */
  canManage: boolean;
  viewerIsOwner: boolean;
};

export function MemberActions({
  organizationSlug,
  member,
  shops,
  isSelf,
  canManage,
  viewerIsOwner,
}: MemberActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null);

  if (!isSelf && !canManage) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${member.label}`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isSelf && (
            <DropdownMenuItem onSelect={() => setDialog("edit")}>
              <PencilIcon />
              Change role & access
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("remove")}>
            {isSelf ? <LogOutIcon /> : <UserMinusIcon />}
            {isSelf ? "Leave organisation" : "Remove from team"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && (
        <EditMemberDialog
          organizationSlug={organizationSlug}
          member={member}
          shops={shops}
          roles={viewerIsOwner ? ASSIGNABLE_ROLES : INVITABLE_ROLES}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog === "remove"}
        onOpenChange={(open) => setDialog(open ? "remove" : null)}
        title={isSelf ? "Leave this organisation?" : `Remove ${member.label}?`}
        description={
          isSelf
            ? "You'll lose access straight away. An owner or admin can invite you again."
            : "They lose access straight away. Their past actions stay in the audit log."
        }
        confirmLabel={isSelf ? "Leave" : "Remove"}
        onConfirm={async () => {
          const result = await removeMember({ organizationSlug, memberId: member.id });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success(isSelf ? "You left the organisation" : `${member.label} removed`);
          if (isSelf) router.push(routes.app);
          return true;
        }}
      />
    </>
  );
}

function EditMemberDialog({
  organizationSlug,
  member,
  shops,
  roles,
  onClose,
}: {
  organizationSlug: string;
  member: MemberActionsProps["member"];
  shops: { id: string; name: string }[];
  roles: readonly OrgRole[];
  onClose: () => void;
}) {
  const [role, setRole] = useState<OrgRole>(member.role);
  const [allShops, setAllShops] = useState(member.allShops);
  const [shopIds, setShopIds] = useState(member.shopIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await updateMember({
        organizationSlug,
        memberId: member.id,
        role,
        allShops,
        shopIds,
      });
      if (!result.ok) {
        setError(result.error.fieldErrors?.shopIds?.[0] ?? result.error.message);
        return;
      }
      toast.success(`${member.label} updated`);
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{member.label}</DialogTitle>
            <DialogDescription>Changes apply the next time they load a page.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <AccessFields
              idPrefix={`member-${member.id}`}
              roles={roles}
              role={role}
              onRoleChange={setRole}
              allShops={allShops}
              onAllShopsChange={setAllShops}
              shopIds={shopIds}
              onShopIdsChange={setShopIds}
              shops={shops}
            />
          </FieldGroup>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
