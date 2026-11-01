import { describe, expect, it } from "vitest";

import { parseLabelParam } from "@/features/labels/shared";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

describe("parseLabelParam", () => {
  it("reads ids with quantities, clamped to 1–500", () => {
    expect([...parseLabelParam(`${a}:12,${b}:9999,nope:3`)]).toEqual([
      [a, 12],
      [b, 500],
    ]);
    expect([...parseLabelParam(`${a}`)]).toEqual([[a, 1]]);
    expect(parseLabelParam(undefined).size).toBe(0);
  });
});
