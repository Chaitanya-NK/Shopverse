"use client";

import { CheckIcon, CopyIcon, UserPlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { inviteMember } from "@/features/team/actions";
import { AccessFields } from "@/features/team/components/access-fields";
import { INVITABLE_ROLES } from "@/features/team/schemas";

type InvitableRole = (typeof INVITABLE_ROLES)[number];

type InviteMemberDialogProps = {
  organizationSlug: string;
  shops: { id: string; name: string }[];
  trigger?: React.ReactNode;
};

export function InviteMemberDialog({ organizationSlug, shops, trigger }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <UserPlusIcon />
            Invite
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {open && (
          <InviteForm
            organizationSlug={organizationSlug}
            shops={shops}
            onClose={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  organizationSlug,
  shops,
  onClose,
}: {
  organizationSlug: string;
  shops: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("staff");
  const [allShops, setAllShops] = useState(true);
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Invitation sent</DialogTitle>
          <DialogDescription>
            {result.emailed
              ? `We emailed ${email}. You can also share this link with them directly.`
              : `We couldn't email ${email}, so share this link with them yourself.`}{" "}
            It works once and expires in 7 days.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={result.link}
            className="font-mono text-xs"
            aria-label="Invitation link"
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(result.link);
              setCopied(true);
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  const submit = () =>
    startTransition(async () => {
      const response = await inviteMember({ organizationSlug, email, role, allShops, shopIds });
      if (!response.ok) {
        const fe = response.error.fieldErrors ?? {};
        setErrors({
          email: fe.email?.[0] ?? "",
          shopIds: fe.shopIds?.[0] ?? "",
          _form: !fe.email && !fe.shopIds ? response.error.message : "",
        });
        return;
      }
      toast.success(`Invited ${email}`);
      setResult(response.data);
    });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Invite a teammate</DialogTitle>
        <DialogDescription>
          They&apos;ll get an email link and sign in with a one-time code.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            placeholder="name@company.com"
            aria-invalid={Boolean(errors.email)}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && <FieldError>{errors.email}</FieldError>}
        </Field>
        <AccessFields
          idPrefix="invite"
          roles={INVITABLE_ROLES}
          role={role}
          onRoleChange={(r) => setRole(r as InvitableRole)}
          allShops={allShops}
          onAllShopsChange={setAllShops}
          shopIds={shopIds}
          onShopIdsChange={setShopIds}
          shops={shops}
          shopError={errors.shopIds}
        />
      </FieldGroup>
      {errors._form && <FieldError>{errors._form}</FieldError>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          Send invitation
        </Button>
      </DialogFooter>
    </form>
  );
}
