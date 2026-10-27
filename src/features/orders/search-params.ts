import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { DELIVERY_VIEW_IDS } from "@/features/orders/deliveries";
import { FULFILLMENT_STATUSES, ORDER_STATUSES, PAYMENT_STATUSES } from "@/features/orders/schemas";
import { SHOP_PARAM } from "@/features/shops/schemas";

/** URL state for the orders list. `shop` is shared with the header's shop switcher. */
export const orderListParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(ORDER_STATUSES),
  payment: parseAsStringLiteral(PAYMENT_STATUSES),
  fulfillment: parseAsStringLiteral(FULFILLMENT_STATUSES),
  [SHOP_PARAM]: parseAsString,
  page: parseAsInteger.withDefault(1),
};

export const loadOrderListParams = createLoader(orderListParams);
export const serializeOrderListParams = createSerializer(orderListParams);

export const ORDERS_PAGE_SIZE = 25;

export const deliveryListParams = {
  view: parseAsStringLiteral(DELIVERY_VIEW_IDS).withDefault("pickup"),
  [SHOP_PARAM]: parseAsString,
  page: parseAsInteger.withDefault(1),
};

export const loadDeliveryListParams = createLoader(deliveryListParams);
export const serializeDeliveryListParams = createSerializer(deliveryListParams);
