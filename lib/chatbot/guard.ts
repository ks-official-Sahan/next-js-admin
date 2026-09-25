// Prompt injection guard and output filtering for the chatbot. Reuses
// lib/ai/guard.ts's wrapUserData pattern for visitor input and adds output
// filtering to prevent revealing admin URLs, arbitrary links, secrets, and HTML.

import { wrapUserData, looksLikeLeak } from "@/lib/ai/guard";

/** Wraps a visitor message as data before it reaches the model. */
export function guardUserMessage(message: string): string {
  return wrapUserData(message);
}

/** Filters model output to prevent leaking secrets, admin URLs, and
 * non-allowed links. Strips HTML tags and sanitizes URLs.
 *
 * Pure function: takes allowed hosts as parameters so it's testable and dependency-injected.
 * allowedHosts: exact hostnames that are safe (e.g., ["example.com", "wa.me", "t.me"])
 * siteHostname: the site's own hostname (e.g., "example.com"), allows subdomains
 * siteEmail: the site owner's email for mailto: validation
 */
export function filterModelOutput(
  text: string,
  options: {
    siteHostname?: string;
    allowedHosts?: string[];
    siteEmail?: string;
  } = {}
): string {
  // Check for leaked secrets first (before any text manipulation)
  if (looksLikeLeak(text)) {
    return "I apologize, but I cannot respond to that request.";
  }

  // Strip HTML tags completely
  let filtered = text.replace(/<[^>]*>/g, "");

  // Build allowlist: exact hosts + site with subdomain support
  const allowedHosts = new Set(options.allowedHosts || []);
  if (options.siteHostname) {
    allowedHosts.add(options.siteHostname);
  }

  // URL regex: require scheme (http://, https://, mailto:) OR www. prefix
  // This prevents matching prose like "Next.js" or "e.g."
  const urlPattern =
    /(https?:\/\/|mailto:)[^\s<>\[\]()]+|www\.[^\s<>\[\]()]+/g;
  const urls = filtered.match(urlPattern) || [];

  for (const url of urls) {
    let isAllowed = false;

    if (url.startsWith("mailto:")) {
      // mailto: only allowed if it matches the configured site email
      const emailMatch = url.match(/^mailto:([^\s?]+)/);
      if (emailMatch && emailMatch[1] === options.siteEmail) {
        isAllowed = true;
      }
    } else if (url.startsWith("http://") || url.startsWith("https://")) {
      // Extract hostname from URL
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname || "";

        // Check exact match or subdomain of site
        for (const allowed of allowedHosts) {
          if (
            hostname === allowed ||
            (options.siteHostname &&
              hostname.endsWith("." + options.siteHostname))
          ) {
            isAllowed = true;
            break;
          }
        }
      } catch {
        // Invalid URL, strip it
        isAllowed = false;
      }
    } else if (url.startsWith("www.")) {
      // www. URLs: extract hostname and check against allowlist
      try {
        const hostname = url
          .replace(/^www\./, "")
          .split(/[/?#]/)[0]; // Extract just the domain part
        for (const allowed of allowedHosts) {
          if (
            hostname === allowed ||
            (options.siteHostname &&
              hostname.endsWith("." + options.siteHostname))
          ) {
            isAllowed = true;
            break;
          }
        }
      } catch {
        isAllowed = false;
      }
    }

    if (!isAllowed) {
      // Strip disallowed URL
      filtered = filtered.replace(url, "[link]");
    }
  }

  // Remove admin paths
  filtered = filtered.replace(/\/admin[^\s]*/g, "");

  // Remove control characters except space and newline
  filtered = filtered.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "");

  return filtered.trim() || "I apologize, but I cannot provide that response.";
}
