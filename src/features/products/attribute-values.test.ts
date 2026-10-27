import { describe, expect, it } from "vitest";

import {
  type AttributeDefinition,
  buildAttributeValuesSchema,
  buildVariantOptionsSchema,
  parseOptionValue,
  toFormAttributeValue,
} from "@/features/products/attribute-values";

const def = (
  d: Partial<AttributeDefinition> & Pick<AttributeDefinition, "key" | "type">,
): AttributeDefinition => ({
  label: d.key,
  options: [],
  unit: null,
  isRequired: false,
  isVariantOption: false,
  ...d,
});

const defs = [
  def({ key: "brand", type: "text", isRequired: true, label: "Brand" }),
  def({ key: "warranty", type: "number" }),
  def({ key: "waterproof", type: "boolean" }),
  def({ key: "fabric", type: "select", options: ["Cotton", "Linen"] }),
  def({ key: "sensors", type: "multiselect", options: ["GPS", "HR"] }),
  def({ key: "launched", type: "date" }),
  def({ key: "storage", type: "select", options: ["128 GB"], isVariantOption: true }),
];

describe("buildAttributeValuesSchema", () => {
  const schema = buildAttributeValuesSchema(defs);

  it("converts form values to stored values and drops empty ones", () => {
    expect(
      schema.parse({
        brand: " Acme ",
        warranty: "12",
        waterproof: true,
        fabric: "",
        sensors: ["GPS", "GPS"],
        launched: "",
      }),
    ).toEqual({ brand: "Acme", warranty: 12, waterproof: true, sensors: ["GPS"] });
  });

  it("reports required and invalid fields by key", () => {
    const result = schema.safeParse({
      brand: "",
      warranty: "twelve",
      fabric: "Silk",
      launched: "2026-13",
    });
    const paths = result.error?.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["brand", "warranty", "fabric", "launched"]));
    expect(result.error?.issues.find((i) => i.path[0] === "brand")?.message).toBe(
      "Brand is required",
    );
  });

  it("rejects unknown keys and ignores variant fields", () => {
    expect(schema.safeParse({ brand: "A", colour: "Red" }).success).toBe(false);
    expect(schema.safeParse({ brand: "A", storage: "128 GB" }).success).toBe(false);
  });
});

describe("variant options", () => {
  const schema = buildVariantOptionsSchema([
    def({ key: "storage", type: "select", options: ["128 GB"], isVariantOption: true }),
    def({ key: "screen", type: "number", isVariantOption: true }),
    def({ key: "brand", type: "text" }),
  ]);

  it("accepts known values and rejects unknown keys or values", () => {
    expect(schema.safeParse({ storage: "128 GB", screen: 6.1 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ storage: "1 TB" }).success).toBe(false);
    expect(schema.safeParse({ brand: "Acme" }).success).toBe(false);
  });

  it("parses typed values by field type", () => {
    expect(parseOptionValue(def({ key: "n", type: "number" }), " 42 ")).toBe(42);
    expect(parseOptionValue(def({ key: "n", type: "number" }), "big")).toBeNull();
    expect(parseOptionValue(def({ key: "s", type: "select", options: ["M"] }), "L")).toBeNull();
    expect(parseOptionValue(def({ key: "t", type: "text" }), " Red ")).toBe("Red");
  });
});

describe("toFormAttributeValue", () => {
  it("maps stored values to form values defensively", () => {
    expect(toFormAttributeValue(def({ key: "n", type: "number" }), 12)).toBe("12");
    expect(toFormAttributeValue(def({ key: "b", type: "boolean" }), "yes")).toBe(false);
    expect(toFormAttributeValue(def({ key: "m", type: "multiselect" }), ["a", 1])).toEqual(["a"]);
    expect(toFormAttributeValue(def({ key: "t", type: "text" }), null)).toBe("");
  });
});
