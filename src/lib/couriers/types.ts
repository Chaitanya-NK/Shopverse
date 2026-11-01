/** What every courier integration provides. Amounts are in rupees. */

export type CourierId = "test";

export type Place = { postalCode: string; state: string; city: string };

export type Parcel = {
  weightGrams: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export type RateRequest = {
  from: Place;
  to: Place;
  parcel: Parcel;
  /** Cash to collect on delivery, or 0 for prepaid. */
  codAmount: number;
};

export type CourierRate = {
  service: string;
  name: string;
  /** Freight plus COD fee, before GST. */
  price: number;
  /** Weight charged (actual or volumetric, rounded up to the slab). */
  chargedGrams: number;
  etaDays: number;
};

export type BookingRequest = RateRequest & {
  service: string;
  reference: string;
};

export type Booking = {
  awb: string;
  service: string;
  price: number;
  estimatedDelivery: Date;
};

export type TrackingUpdate = {
  eventId: string;
  status:
    | "picked_up"
    | "in_transit"
    | "out_for_delivery"
    | "failed_attempt"
    | "delivered"
    | "returned_to_origin";
  description: string;
  location: string | null;
  occurredAt: Date;
};

export interface Courier {
  id: CourierId;
  name: string;
  rates(request: RateRequest): Promise<CourierRate[]>;
  book(request: BookingRequest): Promise<Booking>;
  cancel(awb: string): Promise<void>;
}
