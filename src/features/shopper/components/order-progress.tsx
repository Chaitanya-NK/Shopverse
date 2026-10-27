import { CheckIcon } from "lucide-react";

import { ORDER_STAGE_LABELS, type OrderStage } from "@/features/shopper/schemas";
import { cn } from "@/lib/utils";

const STEPS: OrderStage[] = ["confirmed", "packed", "shipped", "out_for_delivery", "delivered"];

/** Where an order is on its way to the customer. Hidden for cancelled/returned orders. */
export function OrderProgress({ stage }: { stage: OrderStage }) {
  if (stage === "cancelled" || stage === "returned") return null;
  const current = stage === "placed" ? -1 : STEPS.indexOf(stage);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li
            key={step}
            className="flex flex-col items-center gap-2 text-center"
            aria-current={i === current ? "step" : undefined}
          >
            <span className="relative flex w-full items-center justify-center">
              {i > 0 && (
                <span
                  className={cn(
                    "absolute top-1/2 right-1/2 h-0.5 w-full -translate-y-1/2",
                    done ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-4" aria-hidden /> : i + 1}
              </span>
            </span>
            <span
              className={cn(
                "text-xs leading-tight",
                i === current ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {ORDER_STAGE_LABELS[step]}
              <span className="sr-only">{done ? " (done)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
