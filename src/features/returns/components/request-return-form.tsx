"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { routes } from "@/config/routes";
import { requestReturn } from "@/features/returns/actions";
import { ReturnForm } from "@/features/returns/components/return-form";
import { type ReturnOptions } from "@/features/returns/schemas";

/** The shopper's return request, sent from their order. */
export function RequestReturnForm({
  shopSlug,
  orderToken,
  options,
  currency,
}: {
  shopSlug: string;
  orderToken: string;
  options: ReturnOptions;
  currency: string;
}) {
  const router = useRouter();
  return (
    <ReturnForm
      options={options}
      currency={currency}
      submitLabel="Send request"
      onSubmit={async (values) => {
        const result = await requestReturn({ ...values, shopSlug, orderToken });
        if (result.ok) toast.success(`Request ${result.data.number} sent`);
        return result;
      }}
      onDone={() => router.push(routes.storefrontOrder(shopSlug, orderToken))}
    />
  );
}
