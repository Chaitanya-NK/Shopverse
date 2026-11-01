import { z } from "zod";

import { captureError } from "@/lib/observability/capture";

const reportSchema = z.object({
  name: z.string().max(100).default("Error"),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
  digest: z.string().max(100).optional(),
  kind: z.enum(["boundary", "unhandled", "rejection"]).default("unhandled"),
});

/**
 * Errors from browsers (the error reporter and error pages). Anyone can call
 * it, so reports are small, rate limited in the proxy and grouped like server
 * errors. No cookies or personal data are read.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 16_000) return new Response(null, { status: 413 });
  let parsed;
  try {
    parsed = reportSchema.safeParse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });
  const r = parsed.data;
  // Errors that started on the server are already recorded under their digest.
  if (r.digest) return new Response(null, { status: 204 });
  const error = new Error(r.message);
  error.name = r.name;
  error.stack = r.stack ?? `${r.name}: ${r.message}`;
  await captureError(error, {
    source: "client",
    path: r.path,
    context: { kind: r.kind, userAgent: request.headers.get("user-agent")?.slice(0, 200) },
  });
  return new Response(null, { status: 204 });
}
