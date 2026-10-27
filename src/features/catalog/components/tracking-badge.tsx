import { BarcodeIcon, CalendarClockIcon, HashIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TRACKING_LABELS } from "@/features/organizations/industries";
import { type Enums } from "@/types/database.types";

const ICONS = { quantity: HashIcon, serial: BarcodeIcon, batch: CalendarClockIcon } as const;

export function TrackingBadge({ tracking }: { tracking: Enums<"inventory_tracking"> }) {
  const Icon = ICONS[tracking];
  const { label, hint } = TRACKING_LABELS[tracking];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 font-normal">
          <Icon aria-hidden="true" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
