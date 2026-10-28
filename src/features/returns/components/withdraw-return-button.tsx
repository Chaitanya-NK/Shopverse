"use client";

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelReturnRequest } from "@/features/returns/actions";

export function WithdrawReturnButton({
  shopSlug,
  orderToken,
  returnId,
  number,
}: {
  shopSlug: string;
  orderToken: string;
  returnId: string;
  number: string;
}) {
  return (
    <ConfirmDialog
      title={`Withdraw ${number}?`}
      description="The items stay with you. You can ask again while the return window is open."
      confirmLabel="Withdraw request"
      onConfirm={async () => {
        const result = await cancelReturnRequest({ shopSlug, orderToken, returnId });
        if (!result.ok) {
          toast.error(result.error.message);
          return false;
        }
        toast.success("Request withdrawn");
        return true;
      }}
      trigger={
        <Button variant="ghost" size="sm">
          Withdraw
        </Button>
      }
    />
  );
}
