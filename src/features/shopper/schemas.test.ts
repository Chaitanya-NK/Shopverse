import { describe, expect, it } from "vitest";

import {
  addressSchema,
  formatAddressLine,
  profileSchema,
  shopperOrdersSchema,
  signedInCheckoutSchema,
  toAddressJson,
} from "@/features/shopper/schemas";

const address = {
  name: "Meera Iyer",
  phone: "98860 12345",
  line1: "Flat 402, Palm Grove",
  line2: "",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560102",
};

describe("addressSchema", () => {
  it("normalises the phone and defaults optional fields", () => {
    const parsed = addressSchema.parse(address);
    expect(parsed.phone).toBe("9886012345");
    expect(parsed.label).toBe("");
    expect(parsed.isDefault).toBe(false);
  });

  it("rejects bad PIN codes and landlines", () => {
    expect(addressSchema.safeParse({ ...address, postalCode: "0560102" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...address, phone: "080 1234 5678" }).success).toBe(false);
  });
});

describe("signedInCheckoutSchema", () => {
  const base = { shopSlug: "urban-threads", requestId: crypto.randomUUID() };

  it("needs a saved address or a new one", () => {
    const result = signedInCheckoutSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["addressId"]);
  });

  it("accepts either", () => {
    expect(
      signedInCheckoutSchema.safeParse({ ...base, addressId: crypto.randomUUID() }).success,
    ).toBe(true);
    expect(signedInCheckoutSchema.safeParse({ ...base, address }).success).toBe(true);
  });
});

describe("profileSchema", () => {
  it("allows an empty phone", () => {
    expect(profileSchema.parse({ shopSlug: "urban-threads", name: "Ravi", phone: "" }).phone).toBe(
      "",
    );
  });
});

describe("address helpers", () => {
  it("formats one line, skipping an empty landmark", () => {
    expect(formatAddressLine(address)).toBe("Flat 402, Palm Grove, Bengaluru 560102, Karnataka");
  });

  it("maps to the database shape", () => {
    expect(toAddressJson({ ...address, label: "", isDefault: true })).toMatchObject({
      label: null,
      line2: null,
      postal_code: "560102",
      is_default: true,
    });
  });
});

describe("shopperOrdersSchema", () => {
  it("parses orders with their stage", () => {
    const parsed = shopperOrdersSchema.parse({
      total: 1,
      items: [
        {
          number: "ORD-000001",
          placed_at: "2026-10-27T10:00:00Z",
          status: "confirmed",
          stage: "packed",
          grand_total: "548.00",
          currency: "INR",
          public_token: "a".repeat(32),
          can_cancel: false,
          item_count: 1,
          titles: ["Classic cotton tee · M"],
        },
      ],
    });
    expect(parsed.items[0]).toMatchObject({ stage: "packed", grandTotal: 548, canCancel: false });
  });
});
