"use client";

import { BanknoteIcon, SmartphoneIcon } from "lucide-react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { type CheckoutPaymentMethod } from "@/features/storefront/schemas";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const codTooLarge = codLimit !== null && total > codLimit;
  const options = {
    online: {
      icon: SmartphoneIcon,
      title: "Pay online",
      hint: "Cards and other methods on Stripe’s secure payment page.",
      disabled: false,
    },
    cod: {
      icon: BanknoteIcon,
      title: "Cash on delivery",
      hint: codTooLarge
        ? `Available for orders up to ${formatMoney(codLimit!, currency)}.`
        : `Pay ${formatMoney(total, currency)} in cash or UPI to the courier.`,
      disabled: codTooLarge,
    },
  } as const;

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as CheckoutPaymentMethod)}
      className="gap-2"
      aria-label="Payment method"
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
