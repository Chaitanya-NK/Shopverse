import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

/** "Shop.Example.com." -> "shop.example.com"; anything with a scheme or path is refused. */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/\.$/, ""))
  .pipe(
    z
      .string()
      .max(253, "That domain is too long")
      .regex(
        /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
        "Enter just the domain, like shop.example.com",
      ),
  );

export const setDomainSchema = z.object({
  organizationSlug: slugSchema,
  shopId: z.uuid(),
  domain: domainSchema,
});
export type SetDomainInput = z.input<typeof setDomainSchema>;
export const domainRefSchema = z.object({ organizationSlug: slugSchema, shopId: z.uuid() });

/** Where the TXT record goes. */
export const verificationHost = (domain: string) => `_shopverse.${domain}`;

/** "shop.example.com" has a subdomain; "example.com" is the apex (no CNAME allowed). */
export const isApexDomain = (domain: string) => domain.split(".").length === 2;
