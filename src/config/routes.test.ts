import { describe, expect, it } from "vitest";

import { routes, safeReturnTo } from "./routes";

describe("safeReturnTo (open-redirect protection)", () => {
  it.each(["/app", "/app/urban-threads?shop=kids", "/onboarding"])(
    "allows same-origin path %s",
    (path) => {
      expect(safeReturnTo(path)).toBe(path);
    },
  );

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "app",
    "",
    "/app\n/evil",
    undefined,
    42,
  ])("rejects %s", (value) => {
    expect(safeReturnTo(value)).toBe(routes.app);
  });

  it("uses the provided fallback", () => {
    expect(safeReturnTo("https://evil.example", "/onboarding")).toBe("/onboarding");
  });
});

describe("routes", () => {
  it("encodes the return path", () => {
    expect(routes.signIn("/app/x?shop=a&b=1")).toBe("/sign-in?next=%2Fapp%2Fx%3Fshop%3Da%26b%3D1");
  });
});
