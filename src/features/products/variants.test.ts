import { describe, expect, it } from "vitest";

import {
  axesFromVariants,
  cartesian,
  combinationCount,
  suggestSku,
  syncVariants,
  variantSignature,
  variantTitle,
  type VariantRow,
} from "@/features/products/variants";

const axes = [
  { key: "storage", values: ["128 GB", "256 GB"] },
  { key: "colour", values: ["Black", "Rose gold"] },
];

describe("cartesian", () => {
  it("combines axes in order and skips empty ones", () => {
    expect(cartesian([...axes, { key: "size", values: [] }])).toEqual([
      { storage: "128 GB", colour: "Black" },
      { storage: "128 GB", colour: "Rose gold" },
      { storage: "256 GB", colour: "Black" },
      { storage: "256 GB", colour: "Rose gold" },
    ]);
    expect(combinationCount(axes)).toBe(4);
  });

  it("yields a single empty combination without axes", () => {
    expect(cartesian([])).toEqual([{}]);
    expect(combinationCount([])).toBe(1);
  });
});

describe("naming", () => {
  it("signatures ignore key order", () => {
    expect(variantSignature({ a: 1, b: "x" })).toBe(variantSignature({ b: "x", a: 1 }));
  });

  it("titles follow axis order and append units to numbers", () => {
    expect(
      variantTitle({ colour: "Black", storage: 128 }, ["storage", "colour"], { storage: "GB" }),
    ).toBe("128 GB / Black");
    expect(variantTitle({}, [])).toBe("Default");
  });

  it("suggests readable SKUs", () => {
    expect(
      suggestSku("Acme X1 Pro", { colour: "Rose gold", storage: "128 GB" }, ["storage", "colour"]),
    ).toBe("ACMEX1PRO-128GB-ROSEGOLD");
    expect(suggestSku("!!", {}, [])).toBe("SKU");
  });
});

describe("syncVariants", () => {
  const row = (options: VariantRow["options"], extra: Partial<VariantRow> = {}): VariantRow => ({
    options,
    title: "",
    sku: "OLD",
    price: "100",
    compareAtPrice: "",
    costPrice: "",
    barcode: "",
    ...extra,
  });

  it("keeps existing rows and adds new combinations", () => {
    const current = [
      row({ colour: "Black", storage: "128 GB" }, { id: "v1", sku: "KEEP", price: "999" }),
    ];
    const next = syncVariants(current, axes, { title: "Acme X1", defaultPrice: "500" });
    expect(next).toHaveLength(4);
    expect(next[0]).toMatchObject({ id: "v1", sku: "KEEP", price: "999", title: "128 GB / Black" });
    expect(next[1]).toMatchObject({ sku: "ACMEX1-128GB-ROSEGOLD", price: "500" });
    expect(next[1]?.id).toBeUndefined();
  });

  it("drops combinations that no longer exist", () => {
    const current = syncVariants([], axes, { title: "T" });
    const next = syncVariants(current, [axes[0]!], { title: "T" });
    expect(next.map((r) => r.title)).toEqual(["128 GB", "256 GB"]);
  });

  it("fills in a missing SKU on existing rows", () => {
    const next = syncVariants([row({}, { sku: "" })], [], { title: "Rolled oats" });
    expect(next[0]?.sku).toBe("ROLLEDOATS");
  });

  it("keeps the single default row when there are no axes", () => {
    const next = syncVariants([row({}, { id: "v1", sku: "ONE" })], [], { title: "T" });
    expect(next).toEqual([expect.objectContaining({ id: "v1", sku: "ONE", title: "Default" })]);
  });
});

describe("axesFromVariants", () => {
  it("recovers chosen values in first-seen order", () => {
    expect(
      axesFromVariants(
        [
          { options: { storage: 256, colour: "Black" } },
          { options: { storage: 128, colour: "Black" } },
        ],
        ["storage", "colour", "size"],
      ),
    ).toEqual([
      { key: "storage", values: [256, 128] },
      { key: "colour", values: ["Black"] },
      { key: "size", values: [] },
    ]);
  });
});
