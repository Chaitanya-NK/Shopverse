import { createLoader, createSerializer, parseAsInteger, parseAsStringLiteral } from "nuqs/server";

import { PO_VIEW_IDS } from "@/features/purchasing/schemas";

export const purchaseOrderListParams = {
  view: parseAsStringLiteral(PO_VIEW_IDS).withDefault("open"),
  page: parseAsInteger.withDefault(1),
};
export const loadPurchaseOrderListParams = createLoader(purchaseOrderListParams);
export const serializePurchaseOrderListParams = createSerializer(purchaseOrderListParams);
