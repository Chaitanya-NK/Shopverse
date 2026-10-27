import { type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { type ActionResult } from "@/lib/actions/result";

type ActionError = Extract<ActionResult<unknown>, { ok: false }>["error"];

/**
 * Push a server action's error back into a react-hook-form instance:
 * field errors land on their inputs, anything else becomes a root error
 * (rendered by <FormRootError />) and a toast.
 */
export function applyActionError<T extends FieldValues, TOutput extends FieldValues = T>(
  form: UseFormReturn<T, unknown, TOutput>,
  error: ActionError,
) {
  let matchedField = false;
  const knownFields = new Set(Object.keys(form.getValues()));

  for (const [field, messages] of Object.entries(error.fieldErrors ?? {})) {
    const message = messages?.[0];
    if (message && knownFields.has(field)) {
      form.setError(field as Path<T>, { type: "server", message }, { shouldFocus: !matchedField });
      matchedField = true;
    }
  }

  if (!matchedField) {
    form.setError("root.server", { type: error.code, message: error.message });
    toast.error(error.message);
  }
}
