import "server-only";

import pino from "pino";

import { env } from "@/env";

/**
 * Structured JSON logger for server code. Pipe through `pino-pretty` locally
 * (`npm run dev:pretty`). Sensitive fields are redacted at the source.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "tradeloom-web", env: env.NODE_ENV },
  redact: {
    paths: ["*.email", "*.token", "*.password", "*.phone", "email", "token", "password", "phone"],
    censor: "[redacted]",
  },
});
