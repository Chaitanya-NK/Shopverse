import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { RETURN_VIEW_IDS } from "@/features/returns/views";
import { SHOP_PARAM } from "@/features/shops/schemas";

export const returnListParams = {
  view: parseAsStringLiteral(RETURN_VIEW_IDS).withDefault("review"),
  [SHOP_PARAM]: parseAsString,
  page: parseAsInteger.withDefault(1),
};
export const loadReturnListParams = createLoader(returnListParams);
export const serializeReturnListParams = createSerializer(returnListParams);
export const RETURNS_PAGE_SIZE = 25;
