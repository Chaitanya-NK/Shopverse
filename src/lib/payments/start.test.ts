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

  it("needs a name, street, city and PIN code", () => {
    const full = { name: "Asha", line1: "12 MG Road", city: "Pune", postalCode: "411001" };
    expect(billingAddress(full)).not.toBeNull();
    expect(billingAddress({ ...full, name: "  " })).toBeNull();
    expect(billingAddress({ ...full, line1: "" })).toBeNull();
    expect(billingAddress({ ...full, city: null })).toBeNull();
    expect(billingAddress({ ...full, postalCode: undefined })).toBeNull();
  });
});
