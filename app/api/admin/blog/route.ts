import { NextResponse, type NextRequest } from "next/server";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { listAdminPosts } from "@/lib/blog/admin-list";
import { parseAdminPostListParams } from "@/lib/blog/admin-list-params";
import { log } from "@/lib/log";

// JSON for the admin blog list's client-side refetches (lib/admin/hooks/
// use-blog-posts.ts). Same query as the server render (lib/blog/admin-list.ts).
// Unauthorized callers get the same bare 404 as any unknown admin path.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword || !hasPermission(user, "viewBlog")) {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }

  try {
    const page = await listAdminPosts(parseAdminPostListParams(request.nextUrl.searchParams));
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    log.error("admin blog list failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not load posts." }, { status: 500, headers: NO_STORE });
  }
}
