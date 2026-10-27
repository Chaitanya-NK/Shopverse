import { describe, expect, it } from "vitest";

import {
  attributeFormSchema,
  categoryFormSchema,
  createAttributeSchema,
} from "@/features/catalog/schemas";
import { toAttributeKey } from "@/lib/slug";

const field = {
  label: "Fabric",
  key: "fabric",
  type: "select" as const,
  options: ["Cotton", "Linen"],
  unit: "",
  isRequired: true,
  isVariantOption: false,
};

describe("attributeFormSchema", () => {
  it("requires options for list types", () => {
    const result = attributeFormSchema.safeParse({ ...field, options: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["options"]);
  });

  it("rejects duplicate options regardless of case", () => {
    expect(attributeFormSchema.safeParse({ ...field, options: ["Red", "red"] }).success).toBe(
      false,
    );
  });

  it("only lets text, number and list fields create variants", () => {
    const result = attributeFormSchema.safeParse({
      ...field,
      type: "boolean",
      isVariantOption: true,
    });
    expect(result.error?.issues[0]?.path).toEqual(["isVariantOption"]);
  });

  it("drops options for non-list types and 'required' for variant options", () => {
    const parsed = attributeFormSchema.parse({
      ...field,
      type: "number",
      isVariantOption: true,
      unit: "GB",
    });
    expect(parsed.options).toEqual([]);
    expect(parsed.isRequired).toBe(false);
    expect(parsed.unit).toBe("GB");
  });

  it("validates keys like the database", () => {
    expect(attributeFormSchema.safeParse({ ...field, key: "1st" }).success).toBe(false);
    expect(attributeFormSchema.safeParse({ ...field, key: "Fabric" }).success).toBe(false);
  });

  it("composes with routing fields for the action", () => {
    const parsed = createAttributeSchema.parse({
      ...field,
      organizationSlug: "acme",
      categoryId: "6f1c7a3e-2b8d-4c1e-9a5f-0d2e3b4c5a6f",
    });
    expect(parsed).toMatchObject({ organizationSlug: "acme", key: "fabric", unit: null });
  });
});

describe("categoryFormSchema", () => {
  const base = { name: "Smart watches", slug: "smart-watches", tracking: "serial" as const };

  it("treats blank tax fields as unset", () => {
    expect(categoryFormSchema.parse({ ...base, hsnCode: "", gstRate: "" })).toMatchObject({
      hsnCode: null,
      gstRate: null,
    });
  });

  it("parses GST rates and checks HSN codes", () => {
    expect(categoryFormSchema.parse({ ...base, hsnCode: "8517", gstRate: "18" }).gstRate).toBe(18);
    expect(categoryFormSchema.safeParse({ ...base, hsnCode: "85", gstRate: "" }).success).toBe(
      false,
    );
    expect(categoryFormSchema.safeParse({ ...base, hsnCode: "", gstRate: "120" }).success).toBe(
      false,
    );
  });
});

describe("toAttributeKey", () => {
  it.each([
    ["Screen size (in)", "screen_size_in"],
    ["RAM", "ram"],
    ["5G ready", "f_5g_ready"],
  ])("%s -> %s", (label, key) => {
    expect(toAttributeKey(label)).toBe(key);
  });
});
