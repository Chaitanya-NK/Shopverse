"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/observability/report";

/** Reports uncaught browser errors and rejected promises (see /admin/errors). */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Errors from extensions and other origins carry no useful detail.
      if (!event.error || (event.filename && !event.filename.startsWith(window.location.origin)))
        return;
      reportClientError(event.error, "unhandled");
    };
    const onRejection = (event: PromiseRejectionEvent) =>
      reportClientError(event.reason, "rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
