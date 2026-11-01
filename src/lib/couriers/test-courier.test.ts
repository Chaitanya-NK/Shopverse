import { describe, expect, it } from "vitest";

import { chargedWeight, newAwb, nextScan, quote, zoneFor } from "@/lib/couriers/test-courier";

const blr = { postalCode: "560025", state: "Karnataka", city: "Bengaluru" };
const place = (postalCode: string, state: string, city = "") => ({ postalCode, state, city });
const parcel = { weightGrams: 600, lengthCm: 20, breadthCm: 15, heightCm: 5 };

describe("test courier", () => {
  it("picks a zone from the PIN codes and states", () => {
    expect(zoneFor(blr, place("560001", "Karnataka"))).toBe("local");
    expect(zoneFor(blr, place("575001", "Karnataka"))).toBe("regional");
    expect(zoneFor(blr, place("411001", "Maharashtra"))).toBe("metro");
    expect(zoneFor(blr, place("482001", "Madhya Pradesh"))).toBe("national");
    expect(zoneFor(blr, place("781001", "Assam"))).toBe("special");
  });

  it("charges the larger of actual and volumetric weight, in 500 g slabs", () => {
    expect(chargedWeight(parcel)).toBe(1000);
    expect(chargedWeight({ weightGrams: 300, lengthCm: 40, breadthCm: 30, heightCm: 20 })).toBe(
      5000,
    );
    expect(chargedWeight({ weightGrams: 0, lengthCm: 0, breadthCm: 0, heightCm: 0 })).toBe(500);
  });

  it("quotes surface and express, adding a COD fee", () => {
    const prepaid = quote({ from: blr, to: place("411001", "Maharashtra"), parcel, codAmount: 0 });
    expect(prepaid.map((r) => [r.service, r.price])).toEqual([
      ["surface", 90],
      ["express", 144],
    ]);
    const cod = quote({ from: blr, to: place("411001", "Maharashtra"), parcel, codAmount: 4000 });
    expect(cod[0]!.price).toBe(90 + 60);
    expect(
      quote({ from: blr, to: place("411001", "Maharashtra"), parcel, codAmount: 500 })[0]!.price,
    ).toBe(90 + 35);
  });

  it("issues AWBs and walks a parcel to delivery", () => {
    expect(newAwb()).toMatch(/^SVT\d{10}$/);
    const places = { from: blr, to: place("411001", "Maharashtra", "Pune") };
    const statuses: string[] = [];
    let current = "packed";
    for (let i = 0; i < 5; i++) {
      const scan = nextScan(current, "deliver", places);
      if (!scan) break;
      statuses.push(scan.status);
      current = scan.status;
    }
    expect(statuses).toEqual(["picked_up", "in_transit", "out_for_delivery", "delivered"]);
    expect(nextScan("out_for_delivery", "fail", places)?.status).toBe("failed_attempt");
    expect(nextScan("delivered", "deliver", places)).toBeNull();
  });
});
