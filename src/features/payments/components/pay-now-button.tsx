"use client";

import { CreditCardIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOnlineCheckout } from "@/features/payments/components/use-online-checkout";
import { formatMoney } from "@/lib/format";
import { useT } from "@/i18n/client";

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
  const t = useT();
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
          toast.error(t(outcome.message));
          router.refresh();
        }
      }}
    >
      {busy ? <Spinner /> : <CreditCardIcon />}
      {t("Pay {amount} now", { amount: formatMoney(amount, currency) })}
    </Button>
  );
}
