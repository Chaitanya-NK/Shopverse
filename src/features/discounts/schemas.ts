import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { formatMoney } from "@/lib/format";

export const DISCOUNT_KINDS = {
  percent: "Percentage off",
  fixed: "Amount off",
  free_shipping: "Free delivery",
} as const;
export type DiscountKind = keyof typeof DISCOUNT_KINDS;

export const DISCOUNT_STATES = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  inactive: "Off",
} as const;
export type DiscountState = keyof typeof DISCOUNT_STATES;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "", "12", "1,200.50" -> number | null; rejects junk. */
const optionalNumber = (label: string, opts: { integer?: boolean; min?: number } = {}) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      const raw = typeof v === "string" ? v.replace(/[,\s₹%]/g, "") : v;
      if (raw === "" || raw === null || raw === undefined) return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < (opts.min ?? 0) || (opts.integer && !Number.isInteger(n))) {
        ctx.addIssue({
          code: "custom",
          message: opts.integer ? `${label} must be a whole number` : `Enter a valid ${label}`,
        });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    });

export const discountFormSchema = z
  .object({
    organizationSlug: slugSchema,
    discountId: z.uuid().optional(),
    type: z.enum(["code", "automatic"]),
    code: z.string().trim().toUpperCase().optional().default(""),
    title: z.string().trim().min(2, "Give it a short name").max(80, "Keep it under 80 characters"),
    kind: z.enum(["percent", "fixed", "free_shipping"]),
    value: optionalNumber("amount"),
    maxDiscount: optionalNumber("cap", { min: 1 }),
    minSubtotal: optionalNumber("minimum order"),
    startsOn: z.string().regex(ISO_DATE).or(z.literal("")).optional().default(""),
    endsOn: z.string().regex(ISO_DATE).or(z.literal("")).optional().default(""),
    usageLimit: optionalNumber("limit", { integer: true, min: 1 }),
    perCustomerLimit: optionalNumber("limit", { integer: true, min: 1 }),
    firstOrderOnly: z.boolean().optional().default(false),
    allShops: z.boolean().optional().default(true),
    shopIds: z.array(z.uuid()).max(100).optional().default([]),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.type === "code" && !/^[A-Z0-9_-]{3,32}$/.test(d.code))
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "3–32 letters, numbers, - or _ (e.g. DIWALI10)",
      });
    if (d.kind === "percent" && (d.value === null || d.value <= 0 || d.value > 100))
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a percentage from 1 to 100",
      });
    if (d.kind === "fixed" && (d.value === null || d.value <= 0))
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the amount off" });
    if (d.startsOn && d.endsOn && d.endsOn < d.startsOn)
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "Ends before it starts" });
    if (!d.allShops && d.shopIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["shopIds"], message: "Choose at least one shop" });
  });
export type DiscountFormInput = z.input<typeof discountFormSchema>;
export type DiscountFormOutput = z.output<typeof discountFormSchema>;

/** Days are whole days in India: from 00:00 to 23:59:59 IST. */
export const startOfDayIst = (day: string) => `${day}T00:00:00+05:30`;
export const endOfDayIst = (day: string) => `${day}T23:59:59+05:30`;

export type DiscountSummary = {
  id: string;
  code: string | null;
  title: string;
  kind: DiscountKind;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  shopIds: string[] | null;
  isActive: boolean;
  uses: number;
  totalSaved: number;
  state: DiscountState;
};

/** "10% off, up to ₹100 · orders over ₹500 · first order only". */
export function describeDiscount(
  d: Omit<
    DiscountSummary,
    | "id"
    | "uses"
    | "totalSaved"
    | "state"
    | "title"
    | "code"
    | "startsAt"
    | "endsAt"
    | "shopIds"
    | "isActive"
  >,
  currency: string,
) {
  const money = (n: number) => formatMoney(n, currency);
  const parts = [
    d.kind === "percent"
      ? `${d.value}% off${d.maxDiscount ? `, up to ${money(d.maxDiscount)}` : ""}`
      : d.kind === "fixed"
        ? `${money(d.value)} off`
        : "Free delivery",
  ];
  if (d.minSubtotal) parts.push(`orders over ${money(d.minSubtotal)}`);
  if (d.firstOrderOnly) parts.push("first order only");
  if (d.perCustomerLimit) parts.push(`${d.perCustomerLimit}× per customer`);
  return parts.join(" · ");
}
