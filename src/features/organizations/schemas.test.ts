import { describe, expect, it } from "vitest";

import { createOrganizationSchema } from "./schemas";

const valid = {
  organizationName: "Urban Threads Retail",
  organizationSlug: "urban-threads",
  shopName: "Urban Threads",
  currency: "INR",
  warehouseName: "Bengaluru WH",
  warehouseCity: "Bengaluru",
} as const;

describe("createOrganizationSchema", () => {
  it("accepts a complete onboarding payload", () => {
    expect(createOrganizationSchema.safeParse(valid).success).toBe(true);
  });

  it("normalises the slug to lowercase", () => {
    const parsed = createOrganizationSchema.parse({ ...valid, organizationSlug: "Urban-Threads" });
    expect(parsed.organizationSlug).toBe("urban-threads");
  });

  it.each(["-urban", "urban-", "ab", "urban threads", "urban_threads"])(
    "rejects slug %s",
    (slug) => {
      const result = createOrganizationSchema.safeParse({ ...valid, organizationSlug: slug });
      expect(result.success).toBe(false);
    },
  );

  it("rejects unsupported currencies", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, currency: "XYZ" }).success).toBe(false);
  });
});
