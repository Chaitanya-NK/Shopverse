import { Badge } from "@/components/ui/badge";
import { PRODUCT_STATUS_LABELS, type ProductStatus } from "@/features/products/schemas";
import { cn } from "@/lib/utils";

const STYLES: Record<ProductStatus, string> = {
  active: "bg-success text-success-foreground",
  draft: "bg-secondary text-secondary-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STYLES[status])}>
      {PRODUCT_STATUS_LABELS[status]}
    </Badge>
  );
}
