import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { repos } from "@/lib/data";
import type { MediaKind } from "@/lib/data/media";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const KINDS = new Set<MediaKind>(["IMAGE", "VIDEO", "DOCUMENT"]);
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

function decodeCursor(value: string | null): { id: string; createdAt: Date } | undefined | null {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { id?: unknown; createdAt?: unknown };
    if (typeof parsed.id !== "string" || !/^[\w-]{1,64}$/.test(parsed.id) || typeof parsed.createdAt !== "string") return null;
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) return null;
    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({ id: cursor.id, createdAt: cursor.createdAt.toISOString() })).toString("base64url");
}

export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword || !hasPermission(user, "viewMedia")) {
    notFound();
  }

  const params = request.nextUrl.searchParams;
  const rawLimit = Number(params.get("limit") ?? DEFAULT_LIMIT);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    return NextResponse.json({ error: `limit must be between 1 and ${MAX_LIMIT}.` }, { status: 400, headers: NO_STORE });
  }

  const kindValue = params.get("kind");
  if (kindValue && !KINDS.has(kindValue as MediaKind)) {
    return NextResponse.json({ error: "Invalid media kind." }, { status: 400, headers: NO_STORE });
  }
  const kind = kindValue ? (kindValue as MediaKind) : undefined;

  const after = decodeCursor(params.get("after"));
  if (after === null) return NextResponse.json({ error: "Invalid cursor." }, { status: 400, headers: NO_STORE });
  const query = (params.get("q") ?? "").trim().slice(0, 100);

  try {
    const rows = await repos.media.listPage({ query: query || undefined, kind, after, take: rawLimit + 1 });
    const hasMore = rows.length > rawLimit;
    const items = rows.slice(0, rawLimit);
    const last = items.at(-1);
    return NextResponse.json(
      {
        items: items.map(({ id, url, kind, alt, title, folder, width, height }) => ({
          mediaId: id,
          src: url,
          kind,
          alt: alt ?? "",
          title,
          folder,
          width,
          height,
        })),
        nextCursor: hasMore && last ? encodeCursor({ id: last.id, createdAt: last.createdAt }) : null,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    log.error("admin media list failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not load media." }, { status: 500, headers: NO_STORE });
  }
}
