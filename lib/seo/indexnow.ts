import "server-only";

import { getPosts } from "@/lib/blog/queries";
import { SiteMetadata } from "@/config/site";

// IndexNow: tells Bing and every other participating search engine about a
// changed URL immediately, instead of waiting for the next crawl. Ported
// from the same pattern in ValoremAdminPanel's lib/indexnow.ts, scoped down
// to this site's actual routes (no per-project pages — projects live inline
// on /works, matching app/sitemap.ts).
//
// The key doubles as the filename of its own proof file: public/<key>.txt
// must contain exactly the key. IndexNow verifies ownership by fetching
// https://<site>/<key>.txt and comparing it to the key in the ping payload.

const SITE_ORIGIN = SiteMetadata.siteUrl.replace(/\/$/, "");

const STATIC_ROUTES = ["", "/about", "/works", "/updates", "/contact"] as const;

export function absoluteSiteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

function indexNowKey(): string {
  return (process.env.INDEXNOW_KEY ?? "").trim();
}

export function isIndexNowConfigured(): boolean {
  return indexNowKey().length > 0;
}

/** Every public URL this site actually serves: the static pages plus every published post. */
export async function collectIndexableUrls(): Promise<string[]> {
  const staticUrls = STATIC_ROUTES.map((route) => absoluteSiteUrl(route));

  const posts = await getPosts();
  const postUrls = posts.map((post) => absoluteSiteUrl(`/updates/${post.slug}`));

  return [...new Set([...staticUrls, ...postUrls])];
}

export interface IndexNowEndpointResult {
  name: "bing" | "indexnow.org";
  ok: boolean;
  status: number | null;
}

export interface IndexNowPingResult {
  configured: boolean;
  submitted: number;
  endpoints: IndexNowEndpointResult[];
}

/** Submits `urls` to both Bing's and indexnow.org's IndexNow endpoints. */
export async function pingIndexNowWithStatus(urls: string[]): Promise<IndexNowPingResult> {
  const key = indexNowKey();
  if (!key) return { configured: false, submitted: 0, endpoints: [] };

  const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))].slice(0, 10_000);
  if (unique.length === 0) return { configured: true, submitted: 0, endpoints: [] };

  const host = new URL(SITE_ORIGIN).hostname;
  const body = JSON.stringify({
    host,
    key,
    keyLocation: `${SITE_ORIGIN}/${key}.txt`,
    urlList: unique,
  });

  const requests: Array<{ name: IndexNowEndpointResult["name"]; url: string }> = [
    { name: "bing", url: "https://www.bing.com/indexnow" },
    { name: "indexnow.org", url: "https://api.indexnow.org/indexnow" },
  ];

  const settled = await Promise.allSettled(
    requests.map(({ url }) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(8_000),
      })
    )
  );

  const endpoints: IndexNowEndpointResult[] = settled.map((result, index) => {
    const name = requests[index]!.name;
    if (result.status === "rejected") return { name, ok: false, status: null };
    const status = result.value.status;
    return { name, ok: status >= 200 && status < 300, status };
  });

  return { configured: true, submitted: unique.length, endpoints };
}

/**
 * Confirms the public key file matches INDEXNOW_KEY, so a misconfigured or
 * missing public/<key>.txt is visible before it silently makes every ping
 * fail ownership verification. Never returns the key itself.
 */
export async function checkIndexNowKeyFile(fetchImpl: typeof fetch = fetch): Promise<{
  configured: boolean;
  ok: boolean;
  detail: string;
}> {
  const key = indexNowKey();
  if (!key) return { configured: false, ok: false, detail: "Not configured" };

  try {
    const response = await fetchImpl(`${SITE_ORIGIN}/${key}.txt`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { configured: true, ok: false, detail: `Key file HTTP ${response.status}` };
    const body = (await response.text()).trim();
    if (body !== key) return { configured: true, ok: false, detail: "Key file content does not match INDEXNOW_KEY" };
    return { configured: true, ok: true, detail: "Key file reachable and matches" };
  } catch {
    return { configured: true, ok: false, detail: "Key file unreachable" };
  }
}
