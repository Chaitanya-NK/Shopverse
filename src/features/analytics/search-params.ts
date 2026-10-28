import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { RANGE_PRESETS } from "@/features/analytics/ranges";

export const salesParams = {
  range: parseAsStringLiteral(RANGE_PRESETS).withDefault("30d"),
  from: parseAsString,
  to: parseAsString,
  shop: parseAsString,
};
export const loadSalesParams = createLoader(salesParams);

export const gstParams = {
  month: parseAsString,
  shop: parseAsString,
};
export const loadGstParams = createLoader(gstParams);
