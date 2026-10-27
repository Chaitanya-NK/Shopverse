import "server-only";

import { unstable_rethrow } from "next/navigation";
import { type z } from "zod";

import { type ActionResult } from "@/lib/actions/result";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { type AppError, Errors, isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";

type PublicContext = { supabase: ServerSupabaseClient; user: SessionUser | null };
type AuthedContext = { supabase: ServerSupabaseClient; user: SessionUser };

type ActionConfig<TSchema extends z.ZodType, TOutput, TAuth extends boolean> = {
  /** Stable name used in logs, e.g. "auth.verifyOtp". */
  name: string;
  schema: TSchema;
  /** Defaults to true. Public actions (sign-in) set this to false. */
  requireAuth?: TAuth;
  handler: (
    input: z.output<TSchema>,
    ctx: TAuth extends false ? PublicContext : AuthedContext,
  ) => Promise<TOutput>;
};

/**
 * Builds a server action with a consistent pipeline:
 *   1. validate untrusted input with Zod (never trust the client)
 *   2. authenticate (re-checked in every action, not just the page)
 *   3. run the handler with a request-scoped, RLS-bound Supabase client
 *   4. normalise errors into ActionResult and log unexpected ones
 * Next.js control-flow errors (redirect, notFound) are re-thrown untouched.
 */
export function createAction<TSchema extends z.ZodType, TOutput, TAuth extends boolean = true>(
  config: ActionConfig<TSchema, TOutput, TAuth>,
) {
  return async function action(rawInput: z.input<TSchema>): Promise<ActionResult<TOutput>> {
    try {
      const parsed = config.schema.safeParse(rawInput);
      if (!parsed.success) {
        const { fieldErrors } = flattenIssues(parsed.error);
        throw Errors.validation(fieldErrors);
      }

      const supabase = await createClient();
      const user = await getSessionUser();
      if (config.requireAuth !== false && !user) {
        throw Errors.unauthenticated();
      }

      const data = await config.handler(parsed.data, { supabase, user } as TAuth extends false
        ? PublicContext
        : AuthedContext);
      return { ok: true, data };
    } catch (error) {
      unstable_rethrow(error);
      return toFailure(config.name, error);
    }
  };
}

function flattenIssues(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { fieldErrors };
}

function toFailure(name: string, error: unknown): ActionResult<never> {
  const appError: AppError = isAppError(error) ? error : Errors.internal(error);

  if (appError.code === "INTERNAL") {
    logger.error({ action: name, err: appError.cause ?? error }, "Server action failed");
  } else {
    logger.info({ action: name, code: appError.code }, "Server action rejected");
  }

  return {
    ok: false,
    error: { code: appError.code, message: appError.message, fieldErrors: appError.fieldErrors },
  };
}
