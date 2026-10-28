import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { REVIEW_FILTERS, type ReviewFilter } from "@/features/reviews/schemas";
import { SHOP_PARAM } from "@/features/shops/schemas";

const FILTER_IDS = Object.keys(REVIEW_FILTERS) as ReviewFilter[];

export const reviewListParams = {
  filter: parseAsStringLiteral(FILTER_IDS).withDefault("all"),
  [SHOP_PARAM]: parseAsString,
  page: parseAsInteger.withDefault(1),
};
export const loadReviewListParams = createLoader(reviewListParams);
export const serializeReviewListParams = createSerializer(reviewListParams);
