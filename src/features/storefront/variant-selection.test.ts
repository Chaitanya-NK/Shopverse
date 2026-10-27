import { describe, expect, it } from "vitest";

import { type StorefrontVariant } from "@/features/storefront/schemas";
import {
  axisValues,
  findVariant,
  initialSelection,
  isChoiceAvailable,
} from "@/features/storefront/variant-selection";

const variant = (
  id: string,
  options: Record<string, string>,
  available: number,
): StorefrontVariant => ({
  id,
  sku: id,
  title: Object.values(options).join(" / "),
  options,
  price: 100,
  compareAt: null,
  available,
});

const variants = [
  variant("a", { size: "M", colour: "Black" }, 0),
  variant("b", { size: "M", colour: "White" }, 3),
  variant("c", { size: "L", colour: "Black" }, 2),
];

describe("variant selection", () => {
  it("lists axis values in order", () => {
    expect(
      axisValues({
        axes: [
          { key: "size", label: "Size", unit: null, type: "select" },
          { key: "colour", label: "Colour", unit: null, type: "text" },
        ],
        variants,
      }).map((a) => a.values),
    ).toEqual([
      ["M", "L"],
      ["Black", "White"],
    ]);
  });

  it("starts on something in stock", () => {
    expect(initialSelection(variants)).toEqual({ size: "M", colour: "White" });
  });

  it("finds variants and flags unavailable combinations", () => {
    expect(findVariant(variants, { size: "L", colour: "Black" })?.id).toBe("c");
    expect(findVariant(variants, { size: "L", colour: "White" })).toBeUndefined();
    expect(isChoiceAvailable(variants, { size: "M", colour: "White" }, "colour", "Black")).toBe(
      false,
    );
    expect(isChoiceAvailable(variants, { size: "L", colour: "Black" }, "size", "M")).toBe(false);
    expect(isChoiceAvailable(variants, { size: "M", colour: "White" }, "size", "L")).toBe(false);
    expect(isChoiceAvailable(variants, { size: "M" }, "colour", "White")).toBe(true);
  });
});
