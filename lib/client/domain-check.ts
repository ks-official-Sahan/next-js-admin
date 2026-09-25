import { SiteMetadata } from "@/config/site";

/**
 * The URL the share button hands out: the canonical site when the visitor is
 * on it, otherwise the origin they are actually on (the Vercel domain or a
 * preview), which is known to be working because it just served this page.
 * No reachability probe: the public CSP (connect-src 'self') blocks
 * cross-origin requests, so a probe could only ever fail and fall back here.
 */
export function getShareUrl(): string {
  const canonical = new URL(SiteMetadata.siteUrl);
  if (typeof window === "undefined") return canonical.origin;
  return window.location.host === canonical.host ? canonical.origin : window.location.origin;
}
