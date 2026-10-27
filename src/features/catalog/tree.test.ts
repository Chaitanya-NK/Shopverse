import { describe, expect, it } from "vitest";

import { buildCategoryTree, type CategoryNode } from "./tree";

const node = (
  id: string,
  parentId: string | null,
  sortOrder: number,
  extra: Partial<CategoryNode> = {},
): Omit<CategoryNode, "children"> => ({
  id,
  parentId,
  name: id,
  slug: id,
  industry: null,
  tracking: "quantity",
  hsnCode: null,
  gstRate: null,
  sortOrder,
  productCount: 0,
  attributes: [],
  ...extra,
});

describe("buildCategoryTree", () => {
  it("nests children under parents in sort order", () => {
    const tree = buildCategoryTree([
      node("electronics", null, 2),
      node("fashion", null, 1),
      node("laptops", "electronics", 2),
      node("phones", "electronics", 1),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["fashion", "electronics"]);
    expect(tree[1]!.children.map((n) => n.id)).toEqual(["phones", "laptops"]);
  });

  it("promotes orphans to roots instead of dropping them", () => {
    const tree = buildCategoryTree([node("cookware", "hidden-parent", 1)]);
    expect(tree.map((n) => n.id)).toEqual(["cookware"]);
  });

  it("sorts attributes", () => {
    const attr = (key: string, sortOrder: number) => ({
      id: key,
      key,
      label: key,
      type: "text" as const,
      options: [],
      unit: null,
      isRequired: false,
      isVariantOption: false,
      sortOrder,
    });
    const [root] = buildCategoryTree([
      node("phones", null, 1, { attributes: [attr("colour", 2), attr("brand", 1)] }),
    ]);
    expect(root!.attributes.map((a) => a.key)).toEqual(["brand", "colour"]);
  });
});
