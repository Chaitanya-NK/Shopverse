import { type ErrorCode, type FieldErrors } from "@/lib/errors";

/**
 * The only shape a server action returns to the client. Discriminated on `ok`
 * so callers must handle both branches. Errors carry user-safe text only.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
