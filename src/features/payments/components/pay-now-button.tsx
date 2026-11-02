"use client";

import { CreditCardIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { formatMoney } from "@/lib/format";
import { useT } from "@/i18n/client";

/** "Pay ₹X now" for an order that is waiting for its online payment. */
export function PayNowButton({
  shopSlug,
  orderToken,
  amount,
  currency,
  className,
}: {
  shopSlug: string;
  orderToken: string;
  amount: number;
  currency: string;
  className?: string;
}) {
  const t = useT();
  return (
    <Button asChild size="lg" className={className}>
      <Link href={routes.storefrontPay(shopSlug, orderToken)}>
        <CreditCardIcon />
        {t("Pay {amount} now", { amount: formatMoney(amount, currency) })}
      </Link>
    </Button>
  );
}
