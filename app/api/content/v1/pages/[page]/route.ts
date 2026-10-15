import { NextResponse } from "next/server";

import { getPageContent } from "@/lib/cms/loaders";
import { isCmsPage } from "@/lib/cms/registry";
import { CONTENT_CORS_HEADERS, contentNotFound, contentResponse, contentUnavailable, rejectUnknownParams } from "@/lib/api/content";
import { TAGS } from "@/lib/cache/tags";
import { timed } from "@/lib/observability/timing";

export const GET = timed(async function GET(request: Request, { params }: { params: Promise<{ page: string }> }) {
  const rejected = rejectUnknownParams(request);
  if (rejected) return rejected;
  const { page } = await params;
  if (!isCmsPage(page)) return contentNotFound("Page not found.");

  try {
    return contentResponse(request, await getPageContent(page), [TAGS.cms, TAGS.page(page)]);
  } catch (error) {
    return contentUnavailable("CMS page", error, { page });
  }
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CONTENT_CORS_HEADERS });
}
