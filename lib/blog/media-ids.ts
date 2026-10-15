import type { Repos } from "@/lib/data/repos";

/** Ids of library images placed in a post body (`<img data-media-id="...">`). */
export function inlineMediaIds(content: string): string[] {
  const ids = new Set<string>();
  for (const [, attributes] of content.matchAll(/<img\b([^>]*)>/gi)) {
    const match = attributes.match(/(?:^|\s)data-media-id\s*=\s*(?:"([\w-]{1,64})"|'([\w-]{1,64})')/i);
    const id = match?.[1] ?? match?.[2];
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Keep library deletion guards aligned with the references saved on a post. */
export async function syncPostMediaUsage(
  tx: Pick<Repos, "media">,
  postId: string,
  coverMediaId: string | null,
  content: string
): Promise<void> {
  await tx.media.clearUsage("Post", postId);
  const bodyIds = inlineMediaIds(content);
  const requested = [...new Set([...(coverMediaId ? [coverMediaId] : []), ...bodyIds])];
  if (requested.length === 0) return;

  const assets = await tx.media.findMany(requested);
  const byId = new Map(assets.filter((asset) => asset.kind === "IMAGE").map((asset) => [asset.id, asset]));
  if (coverMediaId && !byId.has(coverMediaId)) throw new Error("The selected cover image is unavailable.");
  await tx.media.recordUsages([
    ...(coverMediaId ? [{ mediaId: coverMediaId, entityType: "Post", entityId: postId, field: "cover" }] : []),
    ...bodyIds.filter((mediaId) => byId.has(mediaId)).map((mediaId) => ({ mediaId, entityType: "Post", entityId: postId, field: "body" })),
  ]);
}
