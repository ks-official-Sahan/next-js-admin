import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { decodePublicPostCursor, encodePublicPostCursor, getPublicPostPage } from "@/lib/blog/queries";
import {
  CONTENT_CORS_HEADERS,
  CONTENT_NO_STORE_HEADERS,
  contentBadRequest,
  contentResponse,
  contentUnavailable,
  rejectUnknownParams,
} from "@/lib/api/content";
import { TAGS } from "@/lib/cache/tags";
import { authKit } from "@/lib/auth/kit-config";
import { limit } from "@/lib/cache/ratelimit";
import { clientIp, UNKNOWN_IP } from "@/lib/security/ip";
import { timed } from "@/lib/observability/timing";

const MAX_LIMIT = 50;

export const GET = timed(async function GET(request: NextRequest) {
  const rejected = rejectUnknownParams(request, ["limit", "cursor"]);
  if (rejected) return rejected;

  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    return contentBadRequest(`limit must be between 1 and ${MAX_LIMIT}.`);
  }

  const cursor = decodePublicPostCursor(request.nextUrl.searchParams.get("cursor"));
  if (cursor === null) return contentBadRequest("Invalid cursor.");

  // First pages come from the data cache; a cursor page reads the database
  // (lib/blog/queries.ts, getPostPage), so cursor requests that miss the CDN
  // are rate-limited per IP. Open fail mode, and skipped when the IP is
  // unknown, like the contact form: availability over strictness for a read.
  // The IP is resolved with the same trusted-proxy setting as proxy.ts.
  if (cursor) {
    const ip = clientIp(request.headers, authKit.trustProxy);
    if (ip !== UNKNOWN_IP) {
      const rate = await limit("content:ip", createHash("sha256").update(ip).digest("hex").slice(0, 32));
      if (!rate.ok && !rate.degraded) {
        return NextResponse.json(
          { error: "Too many requests." },
          { status: 429, headers: { ...CONTENT_NO_STORE_HEADERS, "Retry-After": String(rate.resetSeconds) } }
        );
      }
    }
  }

  try {
    const page = await getPublicPostPage(rawLimit, cursor);
    return contentResponse(request, { ...page, nextCursor: page.nextCursor ? encodePublicPostCursor(page.nextCursor) : null }, [TAGS.blogList]);
  } catch (error) {
    return contentUnavailable("blog", error);
  }
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CONTENT_CORS_HEADERS });
}
