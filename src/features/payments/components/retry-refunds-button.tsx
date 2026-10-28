"use client";

import { RotateCcwIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { retryRefunds } from "@/features/payments/actions";

export function RetryRefundsButton({
  organizationSlug,
  orderId,
}: {
  organizationSlug: string;
  orderId: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await retryRefunds({ organizationSlug, orderId });
          if (!result.ok) toast.error(result.error.message);
          else if (result.data.failed > 0)
            toast.error("Stripe didn't accept the refund. Try again shortly.");
          else toast.success("Refund started");
        })
      }
    >
      {isPending ? <Spinner /> : <RotateCcwIcon />}
      Refund now
    </Button>
  );
}
