"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelPlan } from "@/features/billing/actions";

export function CancelPlanButton({
  organizationSlug,
  planName,
  endsOn,
}: {
  organizationSlug: string;
  planName: string;
  endsOn: string | null;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={`Cancel ${planName}?`}
      description={`It stays active${endsOn ? ` until ${endsOn}` : " until the end of the period you've paid for"}, then won't renew. Your shops keep selling after that, but adding products, shops and teammates will need a plan.`}
      confirmLabel="Cancel plan"
      onConfirm={async () => {
        const result = await cancelPlan({ organizationSlug });
        if (!result.ok) {
          toast.error(result.error.message);
          return false;
        }
        toast.success("Your plan won't renew");
        router.refresh();
        return true;
      }}
      trigger={
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Cancel plan
        </Button>
      }
    />
  );
}
