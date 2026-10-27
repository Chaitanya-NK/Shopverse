import {
  createLoader,
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";

/** URL state for the inventory list (`?q=&warehouse=&low=true&page=`). */
export const inventoryListParams = {
  q: parseAsString.withDefault(""),
  warehouse: parseAsString,
  low: parseAsBoolean.withDefault(false),
  page: parseAsInteger.withDefault(1),
};

export const loadInventoryListParams = createLoader(inventoryListParams);
export const serializeInventoryListParams = createSerializer(inventoryListParams);

export const INVENTORY_PAGE_SIZE = 50;
