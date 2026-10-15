import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { compareSnapshots } from "@/lib/blog/revision-diff";
import { repos } from "@/lib/data";
import { log } from "@/lib/log";

import { parseSnapshot, snapshotOf } from "@sahan-sac/blog-kit/revisions";

// GET: a revision of a post compared with the post as it is now, for the
// editor's History panel. Same gate as the edit page (editBlog); anything
// else is a 404, so the route never confirms a post or revision exists.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

async function load(id: string, revisionId: string) {
  try {
    const [post, revision] = await Promise.all([repos.posts.find(id), repos.postRevisions.findData(revisionId, id)]);
    return { post, revision };
  } catch (error) {
    log.error("revision compare read failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword || !hasPermission(user, "editBlog")) notFound();

  const { id, revisionId } = await params;
  const loaded = await load(id, revisionId);
  if (!loaded) return NextResponse.json({ error: "Could not compare this revision." }, { status: 503, headers: NO_STORE });
  if (!loaded.post || !loaded.revision) notFound();

  const snapshot = parseSnapshot(loaded.revision.data);
  if (!snapshot) return NextResponse.json({ error: "This revision can no longer be read." }, { status: 422, headers: NO_STORE });
  return NextResponse.json(compareSnapshots(snapshot, snapshotOf(loaded.post)), { headers: NO_STORE });
}
