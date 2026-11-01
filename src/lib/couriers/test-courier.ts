import { randomInt } from "node:crypto";

import {
  type Booking,
  type BookingRequest,
  type Courier,
  type CourierRate,
  type Parcel,
  type Place,
  type RateRequest,
  type TrackingUpdate,
} from "@/lib/couriers/types";

/**
 * Shopverse Test Courier: behaves like a real Indian courier aggregator
 * (zones by PIN code, weight slabs, volumetric weight, COD fee, AWB numbers,
 * tracking scans) but nothing is picked up and nobody is charged. Use it to
 * try the whole shipping flow; a real courier plugs into the same interface.
 */

export type Zone = "local" | "regional" | "metro" | "national" | "special";

const METRO_PREFIXES = ["11", "40", "56", "60", "70", "50", "41", "38"]; // Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, Ahmedabad
const SPECIAL_PREFIXES = ["17", "18", "19", "73", "74", "78", "79"]; // Himachal, J&K, Sikkim/North Bengal, North East

export function zoneFor(from: Place, to: Place): Zone {
  const a = from.postalCode.trim();
  const b = to.postalCode.trim();
  if (SPECIAL_PREFIXES.some((p) => b.startsWith(p))) return "special";
  if (a.slice(0, 3) === b.slice(0, 3)) return "local";
  if (from.state.trim().toLowerCase() === to.state.trim().toLowerCase()) return "regional";
  if (METRO_PREFIXES.some((p) => a.startsWith(p)) && METRO_PREFIXES.some((p) => b.startsWith(p)))
    return "metro";
  return "national";
}

const SLAB = 500;
/** Rupees for the first and each additional 500 g, by zone. */
const TARIFF: Record<Zone, { first: number; extra: number; days: number }> = {
  local: { first: 32, extra: 28, days: 1 },
  regional: { first: 40, extra: 35, days: 2 },
  metro: { first: 48, extra: 42, days: 3 },
  national: { first: 58, extra: 52, days: 5 },
  special: { first: 82, extra: 70, days: 7 },
};

/** Volumetric weight (L × B × H / 5000 kg), the larger of the two, rounded up to 500 g. */
export function chargedWeight(parcel: Parcel): number {
  const volumetric = ((parcel.lengthCm * parcel.breadthCm * parcel.heightCm) / 5000) * 1000;
  const grams = Math.max(parcel.weightGrams, volumetric, 1);
  return Math.ceil(grams / SLAB) * SLAB;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quote(request: RateRequest): CourierRate[] {
  const zone = zoneFor(request.from, request.to);
  const t = TARIFF[zone];
  const grams = chargedWeight(request.parcel);
  const slabs = grams / SLAB;
  const freight = t.first + t.extra * (slabs - 1);
  const cod = request.codAmount > 0 ? Math.max(35, request.codAmount * 0.015) : 0;
  return [
    {
      service: "surface",
      name: "Surface",
      price: round2(freight + cod),
      chargedGrams: grams,
      etaDays: t.days + 2,
    },
    {
      service: "express",
      name: "Express",
      price: round2(freight * 1.6 + cod),
      chargedGrams: grams,
      etaDays: Math.max(1, t.days),
    },
  ];
}

/** "SVT" + 10 digits. */
export function newAwb(): string {
  return `SVT${String(randomInt(0, 10_000_000_000)).padStart(10, "0")}`;
}

/** The next scan after a status, for the "simulate" button (or a failed delivery). */
export function nextScan(
  current: string,
  attempt: "deliver" | "fail",
  places: { from: Place; to: Place },
  now = new Date(),
): TrackingUpdate | null {
  const id = `${current}-${attempt}-${now.getTime()}`;
  const at = (status: TrackingUpdate["status"], description: string, location: string | null) => ({
    eventId: id,
    status,
    description,
    location,
    occurredAt: now,
  });
  switch (current) {
    case "packed":
      return at("picked_up", "Picked up from the seller", places.from.city || null);
    case "picked_up":
      return at("in_transit", "Arrived at the destination hub", places.to.city || null);
    case "in_transit":
    case "failed_attempt":
      return at(
        "out_for_delivery",
        "Out for delivery with our delivery partner",
        places.to.city || null,
      );
    case "out_for_delivery":
      return attempt === "fail"
        ? at("failed_attempt", "Customer not available; will try again", places.to.city || null)
        : at("delivered", "Delivered to the customer", places.to.city || null);
    default:
      return null;
  }
}

export const testCourier: Courier = {
  id: "test",
  name: "Shopverse Test Courier",
  async rates(request) {
    return quote(request);
  },
  async book(request: BookingRequest): Promise<Booking> {
    const rate = quote(request).find((r) => r.service === request.service);
    if (!rate) throw new Error("Unknown service");
    const eta = new Date();
    eta.setDate(eta.getDate() + rate.etaDays);
    return { awb: newAwb(), service: rate.service, price: rate.price, estimatedDelivery: eta };
  },
  async cancel() {},
};
