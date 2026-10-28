import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const ADMIN_FILTER_IDS = ["all", "trial", "trial_ended", "paying", "past_due"] as const;

export const businessListParams = {
  q: parseAsString.withDefault(""),
  filter: parseAsStringLiteral(ADMIN_FILTER_IDS).withDefault("all"),
  page: parseAsInteger.withDefault(1),
};
export const loadBusinessListParams = createLoader(businessListParams);
export const serializeBusinessListParams = createSerializer(businessListParams);
