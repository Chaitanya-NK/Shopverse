import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type Enums } from "@/types/database.types";

const STYLES: Record<Enums<"shop_status">, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-success text-success-foreground" },
  draft: { label: "Draft", className: "bg-secondary text-secondary-foreground" },
  paused: { label: "Paused", className: "bg-warning text-warning-foreground" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
};

export function ShopStatusBadge({ status }: { status: Enums<"shop_status"> }) {
  const style = STYLES[status];
  return (
    <Badge variant="secondary" className={cn("border-transparent", style.className)}>
      {style.label}
    </Badge>
  );
}
