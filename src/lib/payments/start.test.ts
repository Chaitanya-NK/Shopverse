import { describe, expect, it } from "vitest";

import { billingAddress } from "./start";

describe("billingAddress", () => {
  it("builds Stripe's shape from a delivery address, in India by default", () => {
    expect(
      billingAddress({
        name: " Asha Rao ",
        line1: "12 MG Road",
        line2: "",
        city: "Pune",
        state: "Maharashtra",
        postalCode: "411001",
      }),
    ).toEqual({
      name: "Asha Rao",
      address: {
        line1: "12 MG Road",
        line2: undefined,
        city: "Pune",
        state: "Maharashtra",
        postal_code: "411001",
        country: "IN",
      },
    });
  });

  it("needs a name", () => {
    expect(billingAddress({ name: "  ", city: "Pune" })).toBeNull();
  });
});
