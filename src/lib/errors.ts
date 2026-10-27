/**
 * Application error model. Everything thrown inside a server action or data
 * function is normalised into one of these so the UI receives a stable shape:
 * a machine-readable `code`, a user-safe `message` and optional field errors.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL";

export type FieldErrors = Record<string, string[] | undefined>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;
  readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { fieldErrors?: FieldErrors; cause?: unknown },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
    this.cause = options?.cause;
  }
}

export const Errors = {
  unauthenticated: () => new AppError("UNAUTHENTICATED", "Please sign in to continue."),
  forbidden: (message = "You don't have permission to do that.") =>
    new AppError("FORBIDDEN", message),
  notFound: (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`),
  validation: (fieldErrors: FieldErrors, message = "Please check the highlighted fields.") =>
    new AppError("VALIDATION", message, { fieldErrors }),
  conflict: (message: string, fieldErrors?: FieldErrors) =>
    new AppError("CONFLICT", message, { fieldErrors }),
  rateLimited: (message = "Too many attempts. Please wait a moment and try again.") =>
    new AppError("RATE_LIMITED", message),
  internal: (cause?: unknown) =>
    new AppError("INTERNAL", "Something went wrong on our side. Please try again.", { cause }),
} as const;

/** Postgres SQLSTATE codes we translate into domain errors. */
const PG = {
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
  INSUFFICIENT_PRIVILEGE: "42501",
  NO_DATA_FOUND: "P0002",
} as const;

type PostgrestLikeError = { code?: string; message: string; details?: string | null };

/** Postgres' own wording, which we never show to people. */
const SYSTEM_MESSAGE =
  /^(new row violates|permission denied|duplicate key|query returned no rows)/i;
function isOwnMessage(message: string | undefined): message is string {
  return Boolean(message) && !SYSTEM_MESSAGE.test(message!);
}

/** Map a PostgREST / Postgres error to an AppError. */
export function fromPostgrestError(
  error: PostgrestLikeError,
  context?: { conflictField?: string },
): AppError {
  switch (error.code) {
    case PG.UNIQUE_VIOLATION: {
      // Messages raised by our own functions are written for people; Postgres'
      // own "duplicate key value violates…" text is not.
      const ours = Boolean(error.message) && !error.message.startsWith("duplicate key");
      return Errors.conflict(
        ours ? error.message : "That value is already taken.",
        context?.conflictField
          ? { [context.conflictField]: [ours ? error.message : "Already in use. Try another."] }
          : undefined,
      );
    }
    case PG.INSUFFICIENT_PRIVILEGE:
      // Our functions raise 42501 with sentences meant for people; RLS and
      // grants produce technical text that we replace.
      return Errors.forbidden(isOwnMessage(error.message) ? error.message : undefined);
    case PG.NO_DATA_FOUND:
      return isOwnMessage(error.message)
        ? new AppError("NOT_FOUND", error.message)
        : Errors.notFound();
    case PG.CHECK_VIOLATION:
      return new AppError("VALIDATION", error.message, { cause: error });
    default:
      return Errors.internal(error);
  }
}

type AuthLikeError = { status?: number; code?: string; message: string };

/** Map a Supabase Auth error to an AppError with a user-friendly message. */
export function fromAuthError(error: AuthLikeError): AppError {
  if (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  ) {
    return Errors.rateLimited(
      "Too many codes requested. Please wait a minute before trying again.",
    );
  }
  // Supabase couldn't hand the email to its SMTP server (bad SMTP credentials,
  // unverified sender, provider outage). Not the user's fault; say so plainly.
  if ((error.status ?? 0) >= 500 && /sending .*email/i.test(error.message)) {
    return new AppError(
      "UNAVAILABLE",
      "We couldn't send the verification email right now. Please try again in a few minutes.",
      { cause: error },
    );
  }
  if (error.code === "otp_expired") {
    return new AppError("VALIDATION", "That code has expired or is incorrect. Request a new one.", {
      fieldErrors: { token: ["Invalid or expired code"] },
    });
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    return Errors.validation({ email: ["Enter a valid email address"] });
  }
  return Errors.internal(error);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
