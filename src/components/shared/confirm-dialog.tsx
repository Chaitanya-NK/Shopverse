"use client";

import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

type ConfirmDialogProps = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  /** Return false to keep the dialog open (e.g. the action failed). */
  onConfirm: () => Promise<boolean>;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  destructive?: boolean;
};

/** Confirmation for irreversible actions. Stays open, with a spinner, while the action runs. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  trigger,
  open: controlledOpen,
  onOpenChange,
  destructive = true,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                if (await onConfirm()) setOpen(false);
              });
            }}
          >
            {isPending && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
