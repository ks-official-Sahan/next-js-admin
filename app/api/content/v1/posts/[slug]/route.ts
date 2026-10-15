import { NextResponse } from "next/server";

import { getPostBySlug, getPostRedirect } from "@/lib/blog/queries";
import { CONTENT_CORS_HEADERS, contentNotFound, contentResponse, contentUnavailable, rejectUnknownParams } from "@/lib/api/content";
import { TAGS } from "@/lib/cache/tags";
import { timed } from "@/lib/observability/timing";

export const GET = timed(async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rejected = rejectUnknownParams(request);
  if (rejected) return rejected;
  const { slug } = await params;
  try {
    const data = await getPostBySlug(slug);
    if (!data) {
      // A renamed post's old slug: permanent redirect to its current one.
      const target = await getPostRedirect(slug);
      if (target) return NextResponse.redirect(new URL(`/api/content/v1/posts/${target}`, request.url), 308);
      // A miss is never cached: the post may be published a moment later.
      return contentNotFound("Post not found.");
    }
    return contentResponse(request, data, [TAGS.blogPost(slug)]);
  } catch (error) {
    return contentUnavailable("blog detail", error, { slug });
  }
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CONTENT_CORS_HEADERS });
}
