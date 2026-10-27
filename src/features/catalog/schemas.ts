import { z } from "zod";

import { INDUSTRY_IDS } from "@/features/organizations/industries";
import { slugSchema } from "@/features/organizations/schemas";

export const addIndustriesSchema = z.object({
  organizationSlug: slugSchema,
  industries: z.array(z.enum(INDUSTRY_IDS)).min(1, "Pick at least one industry"),
});

export type AddIndustriesInput = z.input<typeof addIndustriesSchema>;
