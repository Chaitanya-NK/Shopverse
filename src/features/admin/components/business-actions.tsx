"use client";

import { CalendarPlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_NAMES, type PlanId } from "@/config/plans";
import { extendTrial, setPlan } from "@/features/admin/actions";

export function BusinessActions({
  organizationId,
  name,
  plan,
  subscribed,
}: {
  organizationId: string;
  name: string;
  plan: PlanId;
  subscribed: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {plan === "trial" && <ExtendTrialDialog organizationId={organizationId} name={name} />}
      {!subscribed && <SetPlanDialog organizationId={organizationId} name={name} plan={plan} />}
    </div>
  );
}

function ExtendTrialDialog({ organizationId, name }: { organizationId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("14");
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarPlusIcon />
          Extend trial
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extend {name}&apos;s trial</DialogTitle>
          <DialogDescription>
            Counted from today, or from the trial&apos;s end if that&apos;s later.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="extend-days">Extend by</FieldLabel>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger id="extend-days" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["7", "14", "30", "60", "90"].map((d) => (
                <SelectItem key={d} value={d}>
                  {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await extendTrial({ organizationId, days: Number(days) });
                if (!result.ok) {
                  toast.error(result.error.message);
                  return;
                }
                toast.success("Trial extended");
                setOpen(false);
              })
            }
          >
            {isPending && <Spinner />}
            Extend trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetPlanDialog({
  organizationId,
  name,
  plan,
}: {
  organizationId: string;
  name: string;
  plan: PlanId;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<PlanId>(plan);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontalIcon />
          Set plan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set {name}&apos;s plan by hand</DialogTitle>
          <DialogDescription>
            For deals and corrections. It isn&apos;t billed through Stripe and stays until changed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="set-plan">Plan</FieldLabel>
            <Select value={value} onValueChange={(v) => setValue(v as PlanId)}>
              <SelectTrigger id="set-plan" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PLAN_NAMES) as PlanId[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLAN_NAMES[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="set-plan-note">Why</FieldLabel>
            <Textarea
              id="set-plan-note"
              rows={3}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={Boolean(error)}
            />
            <FieldDescription>Kept in the business&apos;s audit log.</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await setPlan({ organizationId, plan: value, note });
                if (!result.ok) {
                  setError(result.error.fieldErrors?.note?.[0] ?? result.error.message);
                  return;
                }
                toast.success(`${name} is on ${PLAN_NAMES[value]}`);
                setOpen(false);
              })
            }
          >
            {isPending && <Spinner />}
            Set plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
