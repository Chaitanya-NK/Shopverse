"use client";

import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { removeNewsletterSubscriber } from "@/features/marketing/newsletter";

export function RemoveSubscriberButton({
  organizationSlug,
  id,
  email,
}: {
  organizationSlug: string;
  id: string;
  email: string;
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${email}`}>
          <Trash2Icon />
        </Button>
      }
      title={`Remove ${email}?`}
      description="Use this when someone asks to be taken off your list."
      confirmLabel="Remove"
      onConfirm={async () => {
        const result = await removeNewsletterSubscriber({ organizationSlug, id });
        if (!result.ok) {
          toast.error(result.error.message);
          return false;
        }
        toast.success("Removed from the list");
        return true;
      }}
    />
  );
}
