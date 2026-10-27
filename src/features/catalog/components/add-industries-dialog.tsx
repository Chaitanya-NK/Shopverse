"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormRootError } from "@/components/shared/form-root-error";
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
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { addIndustries } from "@/features/catalog/actions";
import { type AddIndustriesInput, addIndustriesSchema } from "@/features/catalog/schemas";
import { IndustryPicker } from "@/features/organizations/components/industry-picker";
import { type IndustryId } from "@/features/organizations/industries";
import { applyActionError } from "@/lib/forms/apply-action-error";

type Props = { organizationSlug: string; available: IndustryId[] };

export function AddIndustriesDialog({ organizationSlug, available }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<AddIndustriesInput>({
    resolver: zodResolver(addIndustriesSchema),
    defaultValues: { organizationSlug, industries: [] },
  });

  if (available.length === 0) return null;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await addIndustries(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success("Starter categories added");
      form.reset({ organizationSlug, industries: [] });
      setOpen(false);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Add industry
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <DialogHeader>
            <DialogTitle>Start selling something new</DialogTitle>
            <DialogDescription>
              Each industry adds starter categories with the right product details and stock
              tracking.
            </DialogDescription>
          </DialogHeader>
          <Controller
            name="industries"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="space-y-2">
                <IndustryPicker
                  value={field.value as IndustryId[]}
                  onChange={field.onChange}
                  options={available}
                  invalid={fieldState.invalid}
                  disabled={isPending}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </div>
            )}
          />
          <FormRootError form={form} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              Add categories
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
