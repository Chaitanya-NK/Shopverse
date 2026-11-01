import { Badge } from "@/components/ui/badge";
import { PO_STATUS_LABELS, type PurchaseOrderStatus } from "@/features/purchasing/schemas";

const VARIANT: Record<PurchaseOrderStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  ordered: "default",
  partially_received: "default",
  received: "secondary",
  closed: "secondary",
  cancelled: "outline",
};

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return <Badge variant={VARIANT[status]}>{PO_STATUS_LABELS[status]}</Badge>;
}
