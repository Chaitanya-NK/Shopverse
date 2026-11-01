"use client";

import { AlertCircleIcon } from "lucide-react";
import { type FieldValues, type UseFormReturn } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useT } from "@/i18n/client";

/** Renders the form-level error set by applyActionError (non-field failures). */
export function FormRootError<T extends FieldValues, TOutput extends FieldValues = T>({
  form,
}: {
  form: UseFormReturn<T, unknown, TOutput>;
}) {
  const t = useT();
  const message = form.formState.errors.root?.server?.message;
  if (!message) return null;

  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{t(message)}</AlertDescription>
    </Alert>
  );
}
