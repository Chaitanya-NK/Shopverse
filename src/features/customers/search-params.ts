import { createLoader, createSerializer, parseAsInteger, parseAsString } from "nuqs/server";

export const customerListParams = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export const loadCustomerListParams = createLoader(customerListParams);
export const serializeCustomerListParams = createSerializer(customerListParams);

export const CUSTOMERS_PAGE_SIZE = 25;
