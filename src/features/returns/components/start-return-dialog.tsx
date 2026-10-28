"use client";

import { Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { routes } from "@/config/routes";
import { createStaffReturn } from "@/features/returns/actions";
import { ReturnForm } from "@/features/returns/components/return-form";
import { type ReturnOptions } from "@/features/returns/schemas";

/** Staff start a return for a customer (e.g. at the counter or over the phone). */
export function StartReturnDialog({
  organizationSlug,
  orderId,
  options,
  currency,
}: {
  organizationSlug: string;
  orderId: string;
  options: ReturnOptions;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Undo2Icon />
          Start a return
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start a return</DialogTitle>
          <DialogDescription>
            Returns you start are approved straight away. You can accept items outside the return
            window or marked non-returnable.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ReturnForm
            staff
            options={options}
            currency={currency}
            submitLabel="Start return"
            onSubmit={async (values) => {
              const result = await createStaffReturn({ ...values, organizationSlug, orderId });
              if (result.ok) {
                toast.success("Return started");
                router.push(routes.orgReturn(organizationSlug, result.data.returnId));
              }
              return result;
            }}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
