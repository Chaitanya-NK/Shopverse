"use client";

import { BanknoteIcon, SmartphoneIcon } from "lucide-react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { type CheckoutPaymentMethod } from "@/features/storefront/schemas";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Pay online or cash on delivery, as the shop allows. */
export function PaymentMethodChoice({
  methods,
  value,
  onChange,
  total,
  codLimit,
  currency,
}: {
  methods: CheckoutPaymentMethod[];
  value: CheckoutPaymentMethod;
  onChange: (method: CheckoutPaymentMethod) => void;
  total: number;
  codLimit: number | null;
  currency: string;
}) {
  const t = useT();
  const codTooLarge = codLimit !== null && total > codLimit;
  const options = {
    online: {
      icon: SmartphoneIcon,
      title: t("Pay online"),
      hint: t("Cards and other methods on Stripe’s secure payment page."),
      disabled: false,
    },
    cod: {
      icon: BanknoteIcon,
      title: t("Cash on delivery"),
      hint: codTooLarge
        ? t("Available for orders up to {amount}.", { amount: formatMoney(codLimit!, currency) })
        : t("Pay {amount} in cash or UPI to the courier.", {
            amount: formatMoney(total, currency),
          }),
      disabled: codTooLarge,
    },
  } as const;

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as CheckoutPaymentMethod)}
      className="gap-2"
      aria-label={t("Payment method")}
    >
      {methods.map((method) => {
        const option = options[method];
        const Icon = option.icon;
        return (
          <label
            key={method}
            htmlFor={`pay-${method}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5",
              option.disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <RadioGroupItem
              id={`pay-${method}`}
              value={method}
              disabled={option.disabled}
              className="mt-0.5"
            />
            <Icon className="mt-0.5 size-4 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">{option.title}</span>
              <span className="text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

/** The method to start with: online when offered, unless only COD fits. */
export function defaultPaymentMethod(methods: CheckoutPaymentMethod[]): CheckoutPaymentMethod {
  return methods.includes("online") ? "online" : "cod";
}
