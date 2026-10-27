import {
  createLoader,
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { CATALOG_SORTS, type CatalogSort } from "@/features/storefront/schemas";

export const catalogParams = {
  q: parseAsString.withDefault(""),
  category: parseAsString,
  sort: parseAsStringLiteral(Object.keys(CATALOG_SORTS) as CatalogSort[]).withDefault("newest"),
  page: parseAsInteger.withDefault(1),
  /** Price range in whole rupees, and "in stock only". */
  min: parseAsInteger,
  max: parseAsInteger,
  stock: parseAsBoolean.withDefault(false),
};

export const loadCatalogParams = createLoader(catalogParams);
export const serializeCatalogParams = createSerializer(catalogParams);
