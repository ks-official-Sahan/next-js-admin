import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { log } from "@/lib/log";

/** Public, credential-free read API. Wildcard CORS is safe because this surface returns public published content only. */
export const CONTENT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const CONTENT_CACHE_HEADERS = {
  ...CONTENT_CORS_HEADERS,
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

export const CONTENT_NO_STORE_HEADERS = {
  ...CONTENT_CORS_HEADERS,
  "Cache-Control": "no-store",
};

function errorJson(message: string, status: number, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { ...CONTENT_NO_STORE_HEADERS, ...extra } });
}

/** True when an If-None-Match header names `etag` (weak or strong form, or `*`). */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const tag = candidate.trim();
    return tag === "*" || tag === etag || tag === `W/${etag}`;
  });
}

/**
 * A 200 JSON envelope `{ apiVersion: 1, data }` with a strong ETag (a hash of
 * the body), or a bodiless 304 when the client's If-None-Match already names
 * it. Revalidating clients and the CDN then skip the payload when nothing
 * changed.
 *
 * `tags` are the cache tags of the data behind the response (lib/cache/tags.ts),
 * sent as `Vercel-Cache-Tag`. invalidate() already calls revalidateTag(tag,
 * "max") for them, which on Vercel also marks every CDN copy carrying the tag
 * stale, including each `?limit=`/`?cursor=` variant that revalidatePath on
 * the bare path cannot reach. Without a tag a publish waits out s-maxage.
 */
export function contentResponse(request: Request, data: unknown, tags: readonly string[]): NextResponse {
  const body = JSON.stringify({ apiVersion: 1, data });
  const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 32)}"`;
  const headers: Record<string, string> = { ...CONTENT_CACHE_HEADERS, ETag: etag };
  if (tags.length > 0) headers["Vercel-Cache-Tag"] = [...new Set(tags)].join(",");
  if (etagMatches(request.headers.get("if-none-match"), etag)) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { headers: { ...headers, "Content-Type": "application/json" } });
}

/**
 * A 400 when the URL carries a query parameter outside `allowed`, else null.
 * The CDN keys on the full URL, so an ignored parameter (`?x=1`, `?x=2`, ...)
 * would make every request a cache miss that reaches the function.
 */
export function rejectUnknownParams(request: Request, allowed: readonly string[] = []): NextResponse | null {
  for (const name of new URL(request.url).searchParams.keys()) {
    if (!allowed.includes(name)) return errorJson(`Unknown query parameter: ${name.slice(0, 40)}.`, 400);
  }
  return null;
}

export function contentNotFound(message: string): NextResponse {
  return errorJson(message, 404);
}

export function contentBadRequest(message: string): NextResponse {
  return errorJson(message, 400);
}

/** 503 with Retry-After, logging the cause server-side only. */
export function contentUnavailable(what: string, error: unknown, context: Record<string, unknown> = {}): NextResponse {
  log.error(`public ${what} API failed`, { ...context, error: error instanceof Error ? error.message : String(error) });
  return errorJson("Content is temporarily unavailable.", 503, { "Retry-After": "5" });
}
