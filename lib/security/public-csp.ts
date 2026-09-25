// Baseline Content-Security-Policy for every public (non-admin) route,
// applied statically by next.config.ts. Public pages are static/ISR cached,
// so a per-request nonce (which /admin gets from proxy.ts) is not possible
// here (design notes, D18). This is NOT a shim over
// @sahan-sac/auth-kit/security headers — that package stays admin-only and knows
// nothing about the public site's own third-party hosts (Vercel Analytics/
// Speed Insights, Cloudinary, ...), so the policy is defined app-side.
// No "server-only" import: like packages/auth-kit/src/security/csp.ts, this
// is read directly by next.config.ts, outside any request/RSC scope.

export interface PublicCspOptions {
  /**
   * Next dev needs 'unsafe-eval' for React's debug stacks, a ws:/wss:
   * connect-src for the HMR socket, and (only outside production) Vercel
   * Analytics/Speed Insights load their debug script from an external host
   * instead of the same-origin /_vercel/... path they use in production.
   */
  dev?: boolean;
}

export function buildPublicCsp({ dev = false }: PublicCspOptions = {}): string {
  const script = ["'self'", "'unsafe-inline'"];
  const connect = ["'self'"];
  if (dev) {
    script.push("'unsafe-eval'", "https://va.vercel-scripts.com");
    connect.push("ws:", "wss:");
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // https: (not an enumerated host list) because CMS-authored content and
    // the media library reference Cloudinary and other https image hosts
    // interchangeably; data:/blob: cover inline and generated previews.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // No nonce is possible on a statically cached page, so inline styles and
    // Next's own hydration scripts need 'unsafe-inline' here.
    "style-src 'self' 'unsafe-inline'",
    `script-src ${script.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
  ];
  // Dev serves plain http://localhost; upgrading its subresources to https would break them.
  if (!dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
