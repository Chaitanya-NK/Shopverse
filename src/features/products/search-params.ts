import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { PRODUCT_STATUSES } from "@/features/products/schemas";

/** URL state for the products list (`?q=&status=&category=&page=`), shared by server and client. */
export const productListParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(PRODUCT_STATUSES),
  category: parseAsString,
  page: parseAsInteger.withDefault(1),
};

export const loadProductListParams = createLoader(productListParams);

export const PRODUCTS_PAGE_SIZE = 25;

export const serializeProductListParams = createSerializer(productListParams);
