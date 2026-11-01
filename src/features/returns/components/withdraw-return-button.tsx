"use client";

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelReturnRequest } from "@/features/returns/actions";
import { useT } from "@/i18n/client";

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
  const t = useT();
  return (
    <ConfirmDialog
      title={t("Withdraw {number}?", { number })}
      description={t("The items stay with you. You can ask again while the return window is open.")}
      confirmLabel={t("Withdraw request")}
      onConfirm={async () => {
        const result = await cancelReturnRequest({ shopSlug, orderToken, returnId });
        if (!result.ok) {
          toast.error(t(result.error.message));
          return false;
        }
        toast.success(t("Request withdrawn"));
        return true;
      }}
      trigger={
        <Button variant="ghost" size="sm">
          {t("Withdraw")}
        </Button>
      }
    />
  );
}
