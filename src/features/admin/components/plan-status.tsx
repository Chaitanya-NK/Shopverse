import { Badge } from "@/components/ui/badge";
import { PLAN_NAMES } from "@/config/plans";
import { type AdminBusinessRow } from "@/features/admin/queries";
import { daysUntil } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** Plan and payment state of a business, as a badge. */
export function PlanStatus({
  b,
}: {
  b: Pick<AdminBusinessRow, "plan" | "trial_ends_at" | "past_due_since" | "interval">;
}) {
  if (b.past_due_since) return <Badge variant="destructive">Past due</Badge>;
  if (b.plan !== "trial")
    return (
      <Badge>
        {PLAN_NAMES[b.plan]}
        {b.interval ? ` · ${b.interval}` : " · manual"}
      </Badge>
    );
  const ended = b.trial_ends_at !== null && daysUntil(b.trial_ends_at) <= 0;
  return (
    <Badge variant={ended ? "outline" : "secondary"}>
      {ended ? "Trial ended" : `Trial to ${dateFormat.format(new Date(b.trial_ends_at!))}`}
    </Badge>
  );
}
