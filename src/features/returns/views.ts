import { type ReturnStatus } from "@/features/returns/schemas";

/** Tabs on the returns page, by what needs doing. */
export const RETURN_VIEWS = {
  review: { label: "To review", statuses: ["requested"] },
  pickup: { label: "To collect", statuses: ["approved", "picked_up"] },
  settle: { label: "To settle", statuses: ["received"] },
  done: { label: "Completed", statuses: ["completed"] },
  closed: { label: "Declined & withdrawn", statuses: ["rejected", "cancelled"] },
} as const satisfies Record<string, { label: string; statuses: readonly ReturnStatus[] }>;

export type ReturnView = keyof typeof RETURN_VIEWS;
export const RETURN_VIEW_IDS = Object.keys(RETURN_VIEWS) as ReturnView[];
