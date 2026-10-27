import { type StorefrontProduct, type StorefrontVariant } from "@/features/storefront/schemas";

type Options = Record<string, string | number>;

/** Values each axis offers, in the order variants list them. */
export function axisValues(product: Pick<StorefrontProduct, "axes" | "variants">) {
  return product.axes.map((axis) => {
    const values: (string | number)[] = [];
    for (const v of product.variants) {
      const value = v.options[axis.key];
      if (value !== undefined && !values.includes(value)) values.push(value);
    }
    return { ...axis, values };
  });
}

/** The variant matching every chosen option, if any. */
export function findVariant(
  variants: StorefrontVariant[],
  selected: Options,
): StorefrontVariant | undefined {
  return variants.find((v) => Object.entries(selected).every(([k, val]) => v.options[k] === val));
}

/** Would choosing `value` for `key` (keeping the other choices) lead to something in stock? */
export function isChoiceAvailable(
  variants: StorefrontVariant[],
  selected: Options,
  key: string,
  value: string | number,
): boolean {
  const next = { ...selected, [key]: value };
  return variants.some(
    (v) => v.available > 0 && Object.entries(next).every(([k, val]) => v.options[k] === val),
  );
}

/** Start from the cheapest in-stock variant (or the first one). */
export function initialSelection(variants: StorefrontVariant[]): Options {
  const start = variants.find((v) => v.available > 0) ?? variants[0];
  return start ? { ...start.options } : {};
}
