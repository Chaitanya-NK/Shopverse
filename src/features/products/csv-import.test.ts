import { describe, expect, it } from "vitest";

import {
  type ExistingProduct,
  type ImportContext,
  planProductImport,
  productCsvHeaders,
} from "@/features/products/csv-import";
import { parseCsvRecords } from "@/lib/csv-parse";

const SHOP = "11111111-1111-4111-8111-111111111111";
const CAT = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
const V1 = "44444444-4444-4444-8444-444444444444";

const apparel = {
  id: CAT,
  name: "Kurtas",
  path: "apparel/kurtas",
  defs: [
    {
      key: "size",
      label: "Size",
      type: "select" as const,
      options: ["S", "M", "L"],
      unit: null,
      isRequired: false,
      isVariantOption: true,
    },
    {
      key: "fabric",
      label: "Fabric",
      type: "select" as const,
      options: ["Cotton", "Silk"],
      unit: null,
      isRequired: true,
      isVariantOption: false,
    },
    {
      key: "handmade",
      label: "Handmade",
      type: "boolean" as const,
      options: [],
      unit: null,
      isRequired: false,
      isVariantOption: false,
    },
  ],
};

const existing: ExistingProduct = {
  id: PRODUCT,
  slug: "indigo-kurta",
  title: "Indigo kurta",
  description: "Block printed",
  status: "active",
  categoryId: CAT,
  attributes: { fabric: "Cotton" },
  tags: ["summer"],
  hsnCode: "6211",
  gstRate: 5,
  shopIds: [SHOP],
  variants: [
    {
      id: V1,
      sku: "IND-S",
      title: "S",
      options: { size: "S" },
      price: 999,
      compareAtPrice: null,
      costPrice: 400,
      barcode: null,
    },
  ],
};

const ctx = (): ImportContext => ({
  organizationSlug: "urban-threads",
  categories: [apparel],
  shops: [{ id: SHOP, slug: "urban-threads-store" }],
  existing: new Map([["indigo-kurta", structuredClone(existing)]]),
});

const plan = (csv: string) => {
  const { headers, records } = parseCsvRecords(csv);
  return planProductImport(records, headers, ctx());
};

describe("planProductImport", () => {
  it("groups rows by handle into a new product with variants and options", () => {
    const result = plan(
      [
        "handle,title,category,status,shops,sku,price,option:size,attribute:fabric,attribute:handmade,tags",
        "linen-shirt,Linen shirt,Kurtas,active,urban-threads-store,LIN-S,1299,S,Cotton,yes,summer|linen",
        "linen-shirt,,,,,LIN-M,1349,M,,,",
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    const [p] = result.products;
    expect(p).toMatchObject({ action: "create", lines: [2, 3], variantCount: 2, errors: [] });
    expect(p!.payload).toMatchObject({
      title: "Linen shirt",
      slug: "linen-shirt",
      categoryId: CAT,
      status: "active",
      shopIds: [SHOP],
      tags: ["summer", "linen"],
      attributes: { fabric: "Cotton", handmade: true },
    });
    expect(p!.payload!.variants.map((v) => [v.sku, v.title, v.options, v.price])).toEqual([
      ["LIN-S", "S", { size: "S" }, 1299],
      ["LIN-M", "M", { size: "M" }, 1349],
    ]);
  });

  it("updates an existing product, keeping blank cells and matching variants by SKU", () => {
    const result = plan("handle,sku,price,compare_at_price\nindigo-kurta,ind-s,899,1099\n");
    const [p] = result.products;
    expect(p).toMatchObject({ action: "update", productId: PRODUCT, newVariants: 0, errors: [] });
    expect(p!.payload).toMatchObject({
      title: "Indigo kurta",
      description: "Block printed",
      status: "active",
      tags: ["summer"],
      shopIds: [SHOP],
      attributes: { fabric: "Cotton" },
    });
    expect(p!.payload!.variants).toEqual([
      expect.objectContaining({
        id: V1,
        sku: "IND-S",
        price: 899,
        compareAtPrice: 1099,
        costPrice: 400,
      }),
    ]);
  });

  it("adds a new SKU to an existing product without dropping the others", () => {
    const [p] = plan("handle,sku,price,option:size\nindigo-kurta,IND-L,1049,L").products;
    expect(p).toMatchObject({ action: "update", newVariants: 1, variantCount: 2, errors: [] });
  });

  it("reports problems per product and doesn't build a payload", () => {
    const result = plan(
      [
        "handle,title,category,sku,price,option:size,attribute:fabric,shops",
        "a-shirt,A shirt,Shoes,A-1,100,,,",
        "b-shirt,B shirt,kurtas,B-1,abc,XL,Wool,nowhere",
        "c-shirt,C shirt,kurtas,C-1,100,,,",
      ].join("\n"),
    );
    const [a, b, c] = result.products;
    expect(a!.errors).toEqual(["Category “Shoes” doesn't exist"]);
    expect(b!.payload).toBeNull();
    expect(b!.errors).toEqual(
      expect.arrayContaining([
        "Shop “nowhere” doesn't exist",
        "SKU B-1: “XL” isn't a valid size",
        expect.stringMatching(/^SKU B-1 \(price\)/),
        expect.stringMatching(/^fabric:/),
      ]),
    );
    // Fabric is required for this category.
    expect(c!.errors).toEqual([expect.stringMatching(/^fabric: Choose a fabric/)]);
  });

  it("needs a SKU column and rejects huge files", () => {
    expect(plan("handle,title\nx,X").errors).toEqual(["The file needs a “sku” column."]);
    const rows = Array.from({ length: 2001 }, (_, i) => `p${i},P,S${i},1`);
    expect(plan(["handle,title,sku,price", ...rows].join("\n")).errors[0]).toMatch(/at most 2000/);
  });

  it("derives the handle from the title when the column is missing", () => {
    const [p] = plan(
      "title,category,sku,price,attribute:fabric\nSilk Saree Deluxe,apparel/kurtas,SS-1,5000,Silk",
    ).products;
    expect(p).toMatchObject({ handle: "silk-saree-deluxe", action: "create", errors: [] });
  });
});

describe("productCsvHeaders", () => {
  it("adds option and detail columns for the business's categories", () => {
    expect(productCsvHeaders([apparel]).slice(-3)).toEqual([
      "option:size",
      "attribute:fabric",
      "attribute:handmade",
    ]);
  });
});
