import { Badge } from "@/components/ui/badge";
import { RETURN_STATUS_LABELS, type ReturnStatus } from "@/features/returns/schemas";

const VARIANT: Record<ReturnStatus, "default" | "secondary" | "outline" | "destructive"> = {
  requested: "default",
  approved: "secondary",
  picked_up: "secondary",
  received: "secondary",
  completed: "outline",
  rejected: "outline",
  cancelled: "outline",
};

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <Badge variant={VARIANT[status]}>{RETURN_STATUS_LABELS[status]}</Badge>;
}
