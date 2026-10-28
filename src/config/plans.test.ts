import { describe, expect, it } from "vitest";

import { isUpgrade, planCharge, planPrice } from "@/config/plans";

describe("plans", () => {
  it("prices yearly at ten months and adds GST when registered", () => {
    expect(planPrice("growth", "monthly")).toBe(2999);
    expect(planPrice("growth", "yearly")).toBe(29990);
    expect(planCharge(2999, 18)).toBe(3538.82);
    expect(planCharge(2999, null)).toBe(2999);
  });

  it("knows upgrades from downgrades", () => {
    expect(
      isUpgrade({ plan: "starter", interval: "monthly" }, { plan: "growth", interval: "monthly" }),
    ).toBe(true);
    expect(
      isUpgrade({ plan: "scale", interval: "yearly" }, { plan: "growth", interval: "yearly" }),
    ).toBe(false);
    expect(
      isUpgrade({ plan: "growth", interval: "monthly" }, { plan: "growth", interval: "yearly" }),
    ).toBe(true);
    expect(
      isUpgrade({ plan: "growth", interval: "yearly" }, { plan: "growth", interval: "monthly" }),
    ).toBe(false);
  });
});
