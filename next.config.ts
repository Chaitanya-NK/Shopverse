import type { NextConfig } from "next";

// Validate environment variables at build time (fails fast on misconfiguration).
import "./src/env";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/**
 * Server Actions reject requests whose Origin differs from the server's own
 * host (CSRF protection). Behind a forwarding proxy, such as GitHub Codespaces
 * (https://<codespace>-3000.app.github.dev → localhost:3000), the two differ,
 * so we list the public origins we trust:
 *  - always: the host of NEXT_PUBLIC_APP_URL (your real public URL)
 *  - development only: localhost and Codespaces / VS Code port-forwarding
 *    domains. Codespaces can send either one as Origin, with the other one
 *    in x-forwarded-host, depending on whether you browse the github.dev URL
 *    or the localhost port that VS Code forwards.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).host);
    } catch {
      // invalid URL is reported by env validation
    }
  }
  if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT ?? "3000";
    origins.add(`localhost:${port}`);
    origins.add(`127.0.0.1:${port}`);
    origins.add("**.app.github.dev");
    origins.add("**.github.dev");
    const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
    if (forwardingDomain) origins.add(`**.${forwardingDomain}`);
  }
  return [...origins];
}

const allowedOrigins = trustedOrigins();

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["pino"],
  allowedDevOrigins: allowedOrigins,
  experimental: {
    serverActions: { allowedOrigins, bodySizeLimit: "1mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
