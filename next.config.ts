import type { NextConfig } from "next";

import { buildPublicCsp } from "./lib/security/public-csp";

const dev = process.env.NODE_ENV !== "production";

// Same values as lib/security/headers.ts (re-exported from
// @sahan-sac/auth-kit/security/headers, used everywhere else in the app).
// Inlined here rather than imported: next.config.ts is bundled by Next's own
// config-ts loader (esbuild, targeting CJS) before the app's normal module
// resolver is up, and that bundler does not resolve this package's deep
// subpath `exports` the way Node's own ESM resolver and Turbopack/webpack do
// at request time. Keep this array in sync with the source if it ever changes.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Gzip in `next start` only. In dev it buys nothing on localhost, and its
  // per-response gzip stream is what raises MaxListenersExceededWarning [Gzip]
  // on long streamed pages. Vercel compresses at the edge either way.
  compress: !dev,
  async headers() {
    // Static headers for every route, plus a baseline CSP for everything
    // except /admin and /api/admin: those get their own per-request nonce
    // CSP from proxy.ts, so this entry excludes them by source pattern —
    // sending both would put two conflicting Content-Security-Policy headers
    // on the same admin response.
    return [
      { source: "/:path*", headers: SECURITY_HEADERS.map((header) => ({ ...header })) },
      {
        source: "/((?!admin(?:/|$)|api/admin(?:/|$)).*)",
        headers: [{ key: "Content-Security-Policy", value: buildPublicCsp({ dev }) }],
      },
      // Admin pages and admin APIs: strictly private, no-store, no-cache so proxies and browsers never retain sensitive data
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
  images: {
    qualities: [70, 75, 80, 85, 90, 95],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: `/${process.env.CLOUDINARY_CLOUD_NAME || "**"}/**`,
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "@mantine/core",
      "@mantine/hooks",
      "@tabler/icons-react",
      "lucide-react",
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
