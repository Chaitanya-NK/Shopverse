"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/observability/report";

/** Last-resort boundary when the root layout itself fails. Must render <html>. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => reportClientError(error, "boundary", error.digest), [error]);
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
