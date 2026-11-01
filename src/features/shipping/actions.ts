"use server";

import { refresh } from "next/cache";

import { authorizeOrganization } from "@/features/organizations/server";
import { getOperationsSettings, getShipmentDocument } from "@/features/shipping/queries";
import {
  bookSchema,
  quoteSchema,
  shipmentRefSchema,
  simulateSchema,
} from "@/features/shipping/schemas";
import { applyCourierUpdate } from "@/features/shipping/server";
import { createAction } from "@/lib/actions/create-action";
import { courierFor } from "@/lib/couriers";
import { nextScan } from "@/lib/couriers/test-courier";
import { type Parcel, type Place } from "@/lib/couriers/types";
import { AppError, Errors, fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const FORBIDDEN = "You can't ship orders in this business.";

/** The shipment, the business's courier, where it goes and how much cash to collect. */
async function prepare(
  supabase: ServerSupabaseClient,
  userId: string,
  organizationSlug: string,
  shipmentId: string,
) {
  const org = await authorizeOrganization(
    supabase,
    userId,
    organizationSlug,
    "orders.manage",
    FORBIDDEN,
  );
  const [doc, settings] = await Promise.all([
    getShipmentDocument(shipmentId),
    getOperationsSettings(org.id),
  ]);
  if (!doc) throw Errors.notFound("Shipment");
  const courier = settings.courier ? courierFor(settings.courier) : null;
  if (!courier) throw Errors.validation({}, "Turn on a courier in Alerts & shipping first.");
  const w = doc.warehouse.address;
  const a = doc.order.shipping_address;
  if (!w.postalCode || !w.state)
    throw Errors.validation(
      {},
      `Add ${doc.warehouse.name}'s PIN code and state in Warehouses first.`,
    );
  if (!a.postal_code) throw Errors.validation({}, "The delivery address has no PIN code.");
  const from: Place = { postalCode: w.postalCode, state: w.state, city: w.city ?? "" };
  const to: Place = { postalCode: a.postal_code, state: a.state ?? "", city: a.city ?? "" };

  // Cash on delivery: the order total, less what other parcels already collect.
  let codAmount = 0;
  if (doc.order.payment_method === "cod" && doc.order.payment_status !== "paid") {
    const { data: others, error } = await supabase
      .from("shipments")
      .select("cod_amount")
      .eq("order_id", doc.order.id)
      .neq("id", shipmentId)
      .neq("status", "cancelled");
    if (error) throw fromPostgrestError(error);
    const collected = others.reduce((n, s) => n + Number(s.cod_amount ?? 0), 0);
    codAmount = Math.max(0, Math.round((doc.order.grand_total - collected) * 100) / 100);
  }
  return { org, doc, courier, from, to, codAmount };
}

const toParcel = (p: {
  weightGrams: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}): Parcel => p;

export const quoteCourierRates = createAction({
  name: "shipping.quote",
  schema: quoteSchema,
  handler: async (input, { supabase, user }) => {
    const { doc, courier, from, to, codAmount } = await prepare(
      supabase,
      user.id,
      input.organizationSlug,
      input.shipmentId,
    );
    if (doc.shipment.status !== "packed" || doc.shipment.courier)
      throw Errors.validation({}, "Only packed parcels that aren't booked yet can be booked.");
    const rates = await courier.rates({ from, to, parcel: toParcel(input.parcel), codAmount });
    return { courierName: courier.name, codAmount, rates };
  },
});

export const bookCourier = createAction({
  name: "shipping.book",
  schema: bookSchema,
  handler: async (input, { supabase, user }) => {
    const { doc, courier, from, to, codAmount } = await prepare(
      supabase,
      user.id,
      input.organizationSlug,
      input.shipmentId,
    );
    const parcel = toParcel(input.parcel);
    let booking;
    try {
      booking = await courier.book({
        from,
        to,
        parcel,
        codAmount,
        service: input.service,
        reference: doc.shipment.number ?? doc.order.number,
      });
    } catch (cause) {
      throw new AppError("UNAVAILABLE", "The courier couldn't take this booking. Try again.", {
        cause,
      });
    }
    const { error } = await supabase.rpc("record_courier_booking", {
      p_shipment_id: input.shipmentId,
      p_courier: courier.id,
      p_carrier_name: courier.name,
      p_service: booking.service,
      p_awb: booking.awb,
      p_cost: booking.price,
      p_estimated: booking.estimatedDelivery.toISOString(),
      p_package: {
        weight_grams: parcel.weightGrams,
        length_cm: parcel.lengthCm,
        breadth_cm: parcel.breadthCm,
        height_cm: parcel.heightCm,
      },
      p_cod_amount: codAmount,
    });
    if (error) {
      // Don't leave a booking at the courier that we didn't record.
      await courier.cancel(booking.awb).catch(() => {});
      throw fromPostgrestError(error);
    }
    refresh();
    return { awb: booking.awb, price: booking.price };
  },
});

export const cancelCourierBooking = createAction({
  name: "shipping.cancelBooking",
  schema: shipmentRefSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      FORBIDDEN,
    );
    const doc = await getShipmentDocument(input.shipmentId);
    if (!doc?.shipment.courier || !doc.shipment.awb)
      throw Errors.validation({}, "This parcel isn't booked.");
    const courier = courierFor(doc.shipment.courier);
    if (courier) await courier.cancel(doc.shipment.awb);
    const { error } = await supabase.rpc("clear_courier_booking", {
      p_shipment_id: input.shipmentId,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

/** Test courier only: produce the next tracking scan, as the courier's webhook would. */
export const simulateCourierScan = createAction({
  name: "shipping.simulate",
  schema: simulateSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      FORBIDDEN,
    );
    const doc = await getShipmentDocument(input.shipmentId);
    if (!doc || doc.shipment.courier !== "test" || !doc.shipment.awb)
      throw Errors.validation({}, "Only parcels booked with the test courier can be simulated.");
    const w = doc.warehouse.address;
    const a = doc.order.shipping_address;
    const scan = nextScan(doc.shipment.status, input.outcome, {
      from: { postalCode: w.postalCode ?? "", state: w.state ?? "", city: w.city ?? "" },
      to: { postalCode: a.postal_code ?? "", state: a.state ?? "", city: a.city ?? "" },
    });
    if (!scan) throw Errors.validation({}, "This parcel has no further scans.");
    await applyCourierUpdate("test", doc.shipment.awb, scan);
    refresh();
    return { status: scan.status };
  },
});
