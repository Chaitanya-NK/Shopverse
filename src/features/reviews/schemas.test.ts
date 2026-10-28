import { describe, expect, it } from "vitest";

import { moderateReviewSchema, reviewFormSchema } from "@/features/reviews/schemas";

const base = { shopSlug: "urban-threads", productId: "33333333-3333-4333-8333-333333333333" };

describe("reviewFormSchema", () => {
  it("accepts stars alone and trims text", () => {
    expect(reviewFormSchema.parse({ ...base, rating: "4", title: "  Nice ", body: "" })).toEqual({
      ...base,
      rating: 4,
      title: "Nice",
      body: "",
    });
  });
  it("needs 1 to 5 whole stars", () => {
    for (const rating of [0, 6, 3.5]) {
      expect(reviewFormSchema.safeParse({ ...base, rating }).success).toBe(false);
    }
  });
  it("limits the length of the review", () => {
    expect(reviewFormSchema.safeParse({ ...base, rating: 5, body: "x".repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe("moderateReviewSchema", () => {
  const review = { organizationSlug: "urban-threads", reviewId: base.productId };
  it("allows hiding and clearing a reply", () => {
    expect(moderateReviewSchema.parse({ ...review, status: "hidden", reply: null })).toMatchObject({
      status: "hidden",
      reply: null,
    });
  });
  it("rejects unknown statuses", () => {
    expect(moderateReviewSchema.safeParse({ ...review, status: "deleted" }).success).toBe(false);
  });
});
