import "server-only";

import { SiteMetadata } from "@/config/site";
import { getKv } from "@/lib/cache/redis";
import { getEnv } from "@/lib/env";
import { createActiveUrlResolver, probeOrigin, siteUrlCandidates, type ActiveUrlStatus } from "@/lib/site/active-url";

// Absolute links in emails and copy buttons use the first of the site's
// domains that answers /api/health right now (lib/site/active-url.ts):
// SITE_URLS in order, else SITE_URL, then the public site URL. One probe per instance per five minutes at most, shared through Redis.

const DEFAULT_SITE_URLS = [SiteMetadata.siteUrl];
// Bump the version when the probe rules change, so no older answer is reused.
const SHARED_KEY = "site-url:active:v2";

const globalForSite = globalThis as unknown as {
  activeSiteUrl?: { key: string; resolver: ReturnType<typeof createActiveUrlResolver> };
};

function resolver() {
  const env = getEnv();
  const candidates = siteUrlCandidates({ SITE_URLS: env.SITE_URLS, SITE_URL: env.SITE_URL }, DEFAULT_SITE_URLS);
  const key = `${SHARED_KEY} ${candidates.join(" ")}`;
  // A changed variable gets a fresh resolver; the cached answer belongs to the old list.
  if (globalForSite.activeSiteUrl?.key !== key) {
    const kv = getKv();
    globalForSite.activeSiteUrl = {
      key,
      resolver: createActiveUrlResolver({
        candidates,
        probe: (origin) => probeOrigin(origin),
        shared: {
          get: () => kv.get<string>(key),
          set: async (value, ttlSeconds) => {
            await kv.set(key, value, { ttlSeconds });
          },
        },
      }),
    };
  }
  return globalForSite.activeSiteUrl.resolver;
}

/** Every configured site origin, in order: for allow-lists that are fixed at start-up. */
export function siteOrigins(): string[] {
  const env = getEnv();
  return siteUrlCandidates({ SITE_URLS: env.SITE_URLS, SITE_URL: env.SITE_URL }, DEFAULT_SITE_URLS);
}

/** The active site origin, without a trailing slash. */
export function siteUrl(): Promise<string> {
  return resolver().resolve();
}

export async function absoluteUrl(path: string): Promise<string> {
  return `${await siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Probes now, for the settings screen: which domain is active and which answered. */
export function checkSiteUrls(): Promise<ActiveUrlStatus> {
  return resolver().refresh();
}
