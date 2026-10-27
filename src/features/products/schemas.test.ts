import { describe, expect, it } from "vitest";

import { type AttributeDefinition } from "@/features/products/attribute-values";
import { productFormSchema, withCategoryRules } from "@/features/products/schemas";

const CATEGORY = "6f1c7a3e-2b8d-4c1e-9a5f-0d2e3b4c5a6f";

const variant = (extra: Record<string, unknown> = {}) => ({
  options: {},
  title: "Default",
  sku: "TEE-1",
  price: "499",
  compareAtPrice: "",
  costPrice: "",
  barcode: "",
  ...extra,
});

const product = (extra: Record<string, unknown> = {}) => ({
  title: "Classic tee",
  slug: "classic-tee",
  description: "",
  status: "draft",
  tags: [],
  attributes: {},
  hsnCode: "",
  gstRate: "",
  shopIds: [],
  categoryId: CATEGORY,
  variants: [variant()],
  ...extra,
});

const defs: AttributeDefinition[] = [
  {
    key: "fabric",
    label: "Fabric",
    type: "select",
    options: ["Cotton"],
    unit: null,
    isRequired: true,
    isVariantOption: false,
  },
  {
    key: "size",
    label: "Size",
    type: "select",
    options: ["S", "M"],
    unit: null,
    isRequired: false,
    isVariantOption: true,
  },
];

describe("productFormSchema", () => {
  it("normalises money and blank optional fields", () => {
    const parsed = productFormSchema.parse(
      product({ variants: [variant({ price: "499.999", costPrice: "200" })] }),
    );
    expect(parsed.variants[0]).toMatchObject({
      price: 500,
      costPrice: 200,
      compareAtPrice: null,
      barcode: null,
    });
    expect(parsed).toMatchObject({ description: null, hsnCode: null, gstRate: null });
  });

  it("requires a category and a price", () => {
    const result = productFormSchema.safeParse(
      product({ categoryId: "", variants: [variant({ price: "" })] }),
    );
    const issues = Object.fromEntries(
      result.error!.issues.map((i) => [i.path.join("."), i.message]),
    );
    expect(issues).toMatchObject({
      categoryId: "Choose a category",
      "variants.0.price": "Enter a price",
    });
  });

  it("rejects duplicate SKUs regardless of case", () => {
    const result = productFormSchema.safeParse(
      product({ variants: [variant(), variant({ sku: "tee-1" })] }),
    );
    expect(result.error?.issues[0]).toMatchObject({
      path: ["variants", 1, "sku"],
      message: "Duplicate SKU",
    });
  });

  it("wants compare-at prices above the price", () => {
    const result = productFormSchema.safeParse(
      product({ variants: [variant({ compareAtPrice: "400" })] }),
    );
    expect(result.error?.issues[0]?.path).toEqual(["variants", 0, "compareAtPrice"]);
  });
});

describe("withCategoryRules", () => {
  const schema = withCategoryRules(productFormSchema, defs);

  it("validates details and variant options against the category", () => {
    const ok = schema.parse(
      product({
        attributes: { fabric: "Cotton" },
        variants: [
          variant({ options: { size: "S" } }),
          variant({ sku: "TEE-2", options: { size: "M" } }),
        ],
      }),
    );
    expect(ok.attributes).toEqual({ fabric: "Cotton" });

    const bad = schema.safeParse(
      product({ attributes: {}, variants: [variant({ options: { size: "XL" } })] }),
    );
    const paths = bad.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["attributes.fabric", "variants.0.title"]));
  });
});
