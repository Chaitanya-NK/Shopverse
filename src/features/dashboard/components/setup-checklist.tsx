import { CheckCircle2Icon, CircleIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type ChecklistItem = { label: string; description: string; done: boolean };

export function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get your first shop live</CardTitle>
        <CardDescription>
          {done} of {items.length} steps complete
        </CardDescription>
        <Progress
          value={(done / items.length) * 100}
          className="mt-2"
          aria-label="Setup progress"
        />
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {items.map((item) => (
            <li key={item.label} className="flex items-start gap-3 py-3">
              {item.done ? (
                <CheckCircle2Icon
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-label="Done"
                />
              ) : (
                <CircleIcon
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  aria-label="Not done"
                />
              )}
              <div className="space-y-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    item.done && "text-muted-foreground line-through",
                  )}
                >
                  {item.label}
                </p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
