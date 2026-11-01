import "server-only";

import { createHash } from "node:crypto";

import { env } from "@/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export type ErrorSource = "server" | "client" | "job" | "action";

export type ErrorDetails = {
  source: ErrorSource;
  path?: string | null;
  method?: string | null;
  requestId?: string | null;
  digest?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
};

/** Numbers, ids and quoted values vary between occurrences of the same error. */
function normalise(message: string) {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/"[^"]{0,200}"|'[^']{0,200}'/g, "<value>")
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
}

/** The first stack frame in our own code: where the error came from. */
function topFrame(stack: string | undefined) {
  return (
    stack
      ?.split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("at ") && !l.includes("node_modules") && !l.includes("node:"))
      ?.replace(/:\d+:\d+\)?$/, "")
      .replace(/\?[^)]*$/, "") ?? ""
  );
}

export function fingerprint(source: string, name: string, message: string, stack?: string) {
  return createHash("sha256")
    .update([source, name, normalise(message), topFrame(stack)].join("|"))
    .digest("hex")
    .slice(0, 32);
}

/** Query strings can carry tokens: keep the path only. */
function cleanPath(path: string | null | undefined) {
  if (!path) return null;
  try {
    return new URL(path, "http://x").pathname.slice(0, 500);
  } catch {
    return path.split("?")[0]!.slice(0, 500);
  }
}

/**
 * Record an error for the admin console (grouped by fingerprint) and, when
 * SENTRY_DSN is set, send it to Sentry too. Never throws.
 */
export async function captureError(error: unknown, details: ErrorDetails): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = err.message || err.name || "Error";
    const fp = fingerprint(details.source, err.name, message, err.stack);
    const path = cleanPath(details.path);
    const context = { ...details.context, release: env.APP_RELEASE ?? null };
    await createAdminClient().rpc("record_error", {
      p_fingerprint: fp,
      p_source: details.source,
      p_message: `${err.name}: ${message}`,
      p_stack: err.stack ?? undefined,
      p_path: path ?? undefined,
      p_method: details.method ?? undefined,
      p_request_id: details.requestId ?? undefined,
      p_digest: details.digest ?? undefined,
      p_user_id: details.userId ?? undefined,
      p_context: context as never,
    });
    if (env.SENTRY_DSN) await sendToSentry(err, fp, { ...details, path }, context);
  } catch (cause) {
    logger.warn({ err: cause }, "Recording an error failed");
  }
}

/** Sentry's envelope API with a plain fetch, so no SDK is needed. */
async function sendToSentry(
  err: Error,
  fp: string,
  details: ErrorDetails,
  context: Record<string, unknown>,
) {
  const dsn = new URL(env.SENTRY_DSN!);
  const projectId = dsn.pathname.replace(/^\//, "");
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: env.NODE_ENV,
    release: env.APP_RELEASE,
    fingerprint: [fp],
    tags: { source: details.source, request_id: details.requestId ?? undefined },
    request: details.path ? { url: details.path, method: details.method ?? undefined } : undefined,
    user: details.userId ? { id: details.userId } : undefined,
    extra: context,
    exception: {
      values: [{ type: err.name, value: err.message, stacktrace: stackFrames(err.stack) }],
    },
  };
  const body = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: env.SENTRY_DSN }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  await fetch(`${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-sentry-envelope",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.username}, sentry_client=shopverse/1.0`,
    },
    body,
    signal: AbortSignal.timeout(3000),
  });
}

function stackFrames(stack: string | undefined) {
  const frames = (stack ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({
      function: m[1] ?? "?",
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
    }))
    .reverse();
  return frames.length ? { frames } : undefined;
}
