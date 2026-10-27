import { describe, expect, it } from "vitest";

import { containsPattern, quoteFilterValue } from "@/lib/postgrest";

describe("postgrest helpers", () => {
  it("escapes LIKE wildcards", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });

  it("quotes filter values containing syntax characters", () => {
    expect(quoteFilterValue('a,b.(c)"d')).toBe('"a,b.(c)\\"d"');
  });
});
