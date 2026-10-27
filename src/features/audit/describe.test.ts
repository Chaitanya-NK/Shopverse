import { describe, expect, it } from "vitest";

import { describeAudit } from "@/features/audit/describe";

describe("describeAudit", () => {
  it("words common actions", () => {
    expect(
      describeAudit("shop.updated", { changed: { status: "live", is_active: false } }),
    ).toEqual({
      summary: "Updated shop",
      details: ["status → live", "active → no"],
    });
    expect(describeAudit("invitation.sent", { email: "a@b.in", role: "staff" }).summary).toBe(
      "Invited a@b.in as staff",
    );
    expect(describeAudit("member.deleted", {}).summary).toBe("Deleted team member");
  });

  it("copes with unknown actions and odd metadata", () => {
    expect(describeAudit("thing.frobbed", null)).toEqual({ summary: "frobbed thing", details: [] });
    expect(
      describeAudit("shop.updated", { changed: { name: "x".repeat(60) } }).details[0],
    ).toHaveLength("name → ".length + 38);
  });
});
