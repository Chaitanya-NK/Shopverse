"use client";

import { CreditCardIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOnlineCheckout } from "@/features/payments/components/use-online-checkout";
import { formatMoney } from "@/lib/format";

/** "Pay ₹X now" for an order that is waiting for its online payment. */
export function PayNowButton({
  orderToken,
  amount,
  currency,
  className,
}: {
  orderToken: string;
  amount: number;
  currency: string;
  className?: string;
}) {
  const router = useRouter();
  const { pay, busy } = useOnlineCheckout();
  return (
    <Button
      size="lg"
      className={className}
      disabled={busy}
      onClick={async () => {
        const outcome = await pay(orderToken);
        if (outcome.status === "failed") {
          toast.error(outcome.message);
          router.refresh();
        }
      }}
    >
      {busy ? <Spinner /> : <CreditCardIcon />}
      Pay {formatMoney(amount, currency)} now
    </Button>
  );
}
