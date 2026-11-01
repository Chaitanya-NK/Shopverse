"use client";

import { Badge } from "@/components/ui/badge";
import { RETURN_STATUS_LABELS, type ReturnStatus } from "@/features/returns/schemas";
import { useT } from "@/i18n/client";

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
  const t = useT();
  return <Badge variant={VARIANT[status]}>{t(RETURN_STATUS_LABELS[status])}</Badge>;
}
