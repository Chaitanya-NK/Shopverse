import { type Instrumentation } from "next";

/**
 * Tracing: when OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is set, requests, fetches
 * and database calls are traced and sent there (OpenTelemetry).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "shopverse-web" });
  }
}

/** Every uncaught error while rendering or handling a request. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureError } = await import("@/lib/observability/capture");
  const header = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  await captureError(error, {
    source: "server",
    path: request.path,
    method: request.method,
    requestId: header("x-request-id") ?? null,
    digest: (error as { digest?: string }).digest ?? null,
    context: {
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      renderSource: (context as { renderSource?: string }).renderSource,
    },
  });
};
