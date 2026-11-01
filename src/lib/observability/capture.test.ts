import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {} } }));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test" } }));

const { fingerprint } = await import("@/lib/observability/capture");

describe("error fingerprints", () => {
  const stack = (file: string) =>
    `Error: x\n    at load (/app/node_modules/lib.js:1:1)\n    at run (${file}:10:5)`;
  it("groups the same error with different ids and numbers", () => {
    const a = fingerprint(
      "server",
      "Error",
      "Order 4f1d2a3b-0000-4000-8000-000000000001 not found (42)",
      stack("/app/src/a.ts"),
    );
    const b = fingerprint(
      "server",
      "Error",
      "Order 9e9e9e9e-1111-4111-8111-111111111111 not found (7)",
      stack("/app/src/a.ts"),
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
  it("separates errors from different places or sources", () => {
    const a = fingerprint("server", "Error", "boom", stack("/app/src/a.ts"));
    expect(fingerprint("server", "Error", "boom", stack("/app/src/b.ts"))).not.toBe(a);
    expect(fingerprint("client", "Error", "boom", stack("/app/src/a.ts"))).not.toBe(a);
  });
});
