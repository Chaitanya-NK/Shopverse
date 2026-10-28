import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

const num = z.coerce.number();

export const storefrontReviewsSchema = z
  .object({
    average: num.nullable(),
    count: num,
    distribution: z.record(z.string(), num).nullable(),
    items: z.array(
      z.object({
        rating: num,
        title: z.string().nullable(),
        body: z.string().nullable(),
        created_at: z.string(),
        reply: z.string().nullable(),
        author: z.string(),
      }),
    ),
  })
  .transform((r) => ({
    average: r.average,
    count: r.count,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: r.distribution?.[String(stars)] ?? 0,
    })),
    items: r.items.map((i) => ({
      rating: i.rating,
      title: i.title,
      body: i.body,
      createdAt: i.created_at,
      reply: i.reply,
      author: i.author,
    })),
  }));
export type StorefrontReviews = z.output<typeof storefrontReviewsSchema>;

export const reviewStatusSchema = z
  .object({
    signed_in: z.boolean(),
    eligible: z.boolean(),
    review: z
      .object({
        rating: num,
        title: z.string().nullable(),
        body: z.string().nullable(),
        status: z.enum(["published", "hidden"]),
      })
      .nullable()
      .optional()
      .default(null),
  })
  .transform((s) => ({ signedIn: s.signed_in, eligible: s.eligible, review: s.review }));
export type ReviewStatus = z.output<typeof reviewStatusSchema>;

export const reviewFormSchema = z.object({
  shopSlug: z.string().regex(/^[a-z0-9-]{3,48}$/),
  productId: z.uuid(),
  rating: z.coerce.number().int().min(1, "Choose 1 to 5 stars").max(5, "Choose 1 to 5 stars"),
  title: z.string().trim().max(120, "Keep it under 120 characters").optional().default(""),
  body: z.string().trim().max(2000, "Keep it under 2,000 characters").optional().default(""),
});
export type ReviewFormInput = z.input<typeof reviewFormSchema>;

export const moderateReviewSchema = z.object({
  organizationSlug: slugSchema,
  reviewId: z.uuid(),
  status: z.enum(["published", "hidden"]),
  reply: z.string().trim().max(1000, "Keep it under 1,000 characters").nullable().optional(),
});
export type ModerateReviewInput = z.input<typeof moderateReviewSchema>;

export const REVIEW_FILTERS = {
  all: "All",
  low: "1–2 stars",
  unreplied: "No reply yet",
  hidden: "Hidden",
} as const;
export type ReviewFilter = keyof typeof REVIEW_FILTERS;
