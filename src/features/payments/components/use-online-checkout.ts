"use client";

import { useCallback, useState } from "react";

import { routes } from "@/config/routes";

/**
 * Take an online payment for an order awaiting one: the shopper goes to the
 * shop's payment page, which starts the payment (see ShopPayment). Stripe
 * sends them back to the order page, which confirms it.
 */
export function useOnlineCheckout(shopSlug: string) {
  const [busy, setBusy] = useState(false);

  const pay = useCallback(
    (orderToken: string) => {
      setBusy(true);
      window.location.assign(routes.storefrontPay(shopSlug, orderToken));
    },
    [shopSlug],
  );

  return { pay, busy };
}
