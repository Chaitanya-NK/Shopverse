import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

export const collectionSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Use lowercase letters, numbers and dashes");

export const collectionFormSchema = z.object({
  organizationSlug: slugSchema,
  collectionId: z.uuid().optional(),
  shopId: z.uuid({ error: "Choose a shop" }),
  title: z.string().trim().min(2, "Give it a name").max(80, "Keep it under 80 characters"),
  slug: collectionSlugSchema,
  description: z.string().trim().max(1000, "Keep it under 1,000 characters").optional().default(""),
  featured: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});
export type CollectionFormInput = z.input<typeof collectionFormSchema>;

const ref = { organizationSlug: slugSchema, collectionId: z.uuid() };
export const collectionRefSchema = z.object(ref);
export const collectionProductsSchema = z.object({
  ...ref,
  productIds: z.array(z.uuid()).min(1, "Choose at least one product").max(200),
});
export const reorderCollectionSchema = z.object({ ...ref, productIds: z.array(z.uuid()).max(500) });
