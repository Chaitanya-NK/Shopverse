import { describe, expect, it } from "vitest";

import { imageObjectKey, orderForVariant, productImageSchema } from "@/features/products/images";

const path =
  "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333";

describe("product images", () => {
  it("derives the stored file for each size", () => {
    expect(imageObjectKey(path, "large")).toBe(`${path}-1600.webp`);
    expect(imageObjectKey(path, "thumb")).toBe(`${path}-480.webp`);
  });

  it("accepts a cover or nothing", () => {
    expect(productImageSchema.parse(null)).toBeNull();
    expect(productImageSchema.parse(undefined)).toBeNull();
    expect(productImageSchema.parse({ path, alt: null, width: 10, height: 10 })).toMatchObject({
      path,
    });
  });

  it("rejects paths that could escape the product's folder", () => {
    expect(() =>
      productImageSchema.parse({ path: "../../etc/passwd", alt: null, width: 1, height: 1 }),
    ).toThrow();
  });
});

describe("orderForVariant", () => {
  const imgs = [
    { id: "a", variant_id: null },
    { id: "b", variant_id: "red" },
    { id: "c", variant_id: "blue" },
    { id: "d", variant_id: null },
  ];
  it("puts the chosen variant's photos first, then shared, then others", () => {
    expect(orderForVariant(imgs, "blue").map((i) => i.id)).toEqual(["c", "a", "d", "b"]);
  });
  it("keeps the original order when the variant has no photos of its own", () => {
    expect(orderForVariant(imgs, "green")).toBe(imgs);
    expect(orderForVariant(imgs, null)).toBe(imgs);
  });
});
