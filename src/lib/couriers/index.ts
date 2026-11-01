import { testCourier } from "@/lib/couriers/test-courier";
import { type Courier, type CourierId } from "@/lib/couriers/types";

const COURIERS: Record<CourierId, Courier> = { test: testCourier };

export const COURIER_IDS = Object.keys(COURIERS) as CourierId[];
export const courierFor = (id: string): Courier | null =>
  (COURIERS as Record<string, Courier>)[id] ?? null;
