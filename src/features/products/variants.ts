import { type OptionValue } from "@/features/products/attribute-values";

/** One variant axis: a variant-option field and the values chosen for it. */
export type VariantAxis = { key: string; values: OptionValue[] };

export type VariantOptions = Record<string, OptionValue>;

/** A row in the variant matrix as the form holds it (money as strings). */
export type VariantRow = {
  /** Present for variants that already exist. */
  id?: string;
  options: VariantOptions;
  title: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  barcode: string;
};

export const MAX_VARIANTS = 250;

/** Every combination of the axes' values, in axis order. Axes without values are skipped. */
export function cartesian(axes: readonly VariantAxis[]): VariantOptions[] {
  return axes
    .filter((axis) => axis.values.length > 0)
    .reduce<VariantOptions[]>(
      (combos, axis) =>
        combos.flatMap((combo) => axis.values.map((v) => ({ ...combo, [axis.key]: v }))),
      [{}],
    );
}

/** Order-independent identity of a combination, e.g. for matching existing variants. */
export function variantSignature(options: VariantOptions): string {
  return JSON.stringify(
    Object.keys(options)
      .sort()
      .map((key) => [key, options[key]]),
  );
}

/** "128 GB / Black" (axis order); "Default" when there are no options. */
export function variantTitle(
  options: VariantOptions,
  axisOrder: readonly string[],
  units: Record<string, string | null> = {},
): string {
  const parts = axisOrder
    .filter((key) => options[key] !== undefined)
    .map((key) =>
      units[key] && typeof options[key] === "number"
        ? `${options[key]} ${units[key]}`
        : String(options[key]),
    );
  return parts.length > 0 ? parts.join(" / ") : "Default";
}

/** Uppercase SKU fragment: "Rose gold" -> "ROSEGOLD", "128 GB" -> "128GB". */
function skuPart(value: string, max = 8): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, max);
}

/** A readable SKU from the product title and option values, e.g. "ACMEX1-128GB-BLACK". */
export function suggestSku(
  title: string,
  options: VariantOptions,
  axisOrder: readonly string[],
): string {
  const base = skuPart(title, 12) || "SKU";
  const parts = axisOrder
    .map((key) => options[key])
    .filter((v): v is OptionValue => v !== undefined)
    .map((v) => skuPart(String(v)))
    .filter(Boolean);
  return [base, ...parts].join("-").slice(0, 64);
}

/**
 * Rebuild the variant matrix after the axes change. Rows whose combination
 * still exists keep their id, SKU, prices and barcode; new combinations get a
 * suggested SKU and the given default price. With no axes there is one row.
 */
export function syncVariants(
  current: readonly VariantRow[],
  axes: readonly VariantAxis[],
  context: { title: string; defaultPrice?: string; units?: Record<string, string | null> },
): VariantRow[] {
  const axisOrder = axes.filter((a) => a.values.length > 0).map((a) => a.key);
  const existing = new Map(current.map((row) => [variantSignature(row.options), row]));
  const fallbackPrice = context.defaultPrice ?? current[0]?.price ?? "";

  return cartesian(axes).map((options) => {
    const match =
      existing.get(variantSignature(options)) ?? (axisOrder.length === 0 ? current[0] : undefined);
    const title = variantTitle(options, axisOrder, context.units);
    if (match) {
      return {
        ...match,
        options,
        title,
        sku: match.sku || suggestSku(context.title, options, axisOrder),
      };
    }
    return {
      options,
      title,
      sku: suggestSku(context.title, options, axisOrder),
      price: fallbackPrice,
      compareAtPrice: "",
      costPrice: "",
      barcode: "",
    };
  });
}

/** The axes implied by a set of existing variants (used when editing). */
export function axesFromVariants(
  variants: readonly { options: VariantOptions }[],
  axisKeys: readonly string[],
): VariantAxis[] {
  return axisKeys.map((key) => {
    const values: OptionValue[] = [];
    for (const v of variants) {
      const value = v.options[key];
      if (value !== undefined && !values.includes(value)) values.push(value);
    }
    return { key, values };
  });
}

/** Number of variants the axes would produce. */
export function combinationCount(axes: readonly VariantAxis[]): number {
  return axes.reduce((n, a) => (a.values.length > 0 ? n * a.values.length : n), 1);
}
