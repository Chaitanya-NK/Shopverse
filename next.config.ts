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

// GitHub Codespaces serves the app from https://<codespace>-3000.app.github.dev,
// a different origin from the server's own host. Allow it only inside Codespaces.
const codespacesOrigins = process.env.CODESPACES ? ["*.app.github.dev"] : [];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["pino"],
  allowedDevOrigins: codespacesOrigins,
  experimental: {
    serverActions: { allowedOrigins: codespacesOrigins, bodySizeLimit: "1mb" },
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
