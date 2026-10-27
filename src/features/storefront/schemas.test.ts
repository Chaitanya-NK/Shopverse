import { describe, expect, it } from "vitest";

import {
  MAX_LINE_QUANTITY,
  parseCart,
  setCartLine,
  shippingFor,
} from "@/features/storefront/schemas";

const A = "6f1c7a3e-2b8d-4c1e-9a5f-0d2e3b4c5a6f";
const B = "7a2d8b4f-3c9e-4d2f-8b6a-1e3f4c5d6b7a";

describe("cart cookie", () => {
  it("ignores malformed cookies", () => {
    expect(parseCart(undefined)).toEqual([]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(JSON.stringify([{ v: "nope", q: 1 }]))).toEqual([]);
    expect(parseCart(JSON.stringify([{ v: A, q: 0 }]))).toEqual([]);
  });

  it("merges duplicate lines and caps quantities", () => {
    expect(
      parseCart(
        JSON.stringify([
          { v: A, q: 15 },
          { v: A, q: 10 },
        ]),
      ),
    ).toEqual([{ v: A, q: MAX_LINE_QUANTITY }]);
  });

  it("adds, sets and removes lines", () => {
    let cart = setCartLine([], A, 2, "add");
    cart = setCartLine(cart, A, 1, "add");
    cart = setCartLine(cart, B, 1, "add");
    expect(cart).toEqual([
      { v: A, q: 3 },
      { v: B, q: 1 },
    ]);
    expect(setCartLine(cart, A, 0, "set")).toEqual([{ v: B, q: 1 }]);
    expect(setCartLine(cart, B, 99, "set")).toContainEqual({ v: B, q: MAX_LINE_QUANTITY });
  });
});

describe("shippingFor", () => {
  it("applies the fee below the free-shipping threshold", () => {
    expect(shippingFor(999, { shippingFee: 49, freeShippingOver: 1000 })).toBe(49);
    expect(shippingFor(1000, { shippingFee: 49, freeShippingOver: 1000 })).toBe(0);
    expect(shippingFor(5000, { shippingFee: 49, freeShippingOver: null })).toBe(49);
  });
});
