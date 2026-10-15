"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
import type { ActionState } from "@/lib/actions/state";
import { done, fail } from "@/lib/actions/state";
import { audit } from "@/lib/admin/audit";
import { hasPermission, type AuthUser } from "@/lib/auth/dal";
import { syncPostMediaUsage } from "@/lib/blog/media-ids";
import { invalidate } from "@/lib/cache/invalidate";
import { forPost } from "@/lib/cache/plan";
import { repos, withTx } from "@/lib/data";
import type { Repos } from "@/lib/data/repos";
import { UniqueViolation } from "@/lib/data/errors";
import { TrashRestoreError, type TrashItem } from "@/lib/data/trash";
import { log } from "@/lib/log";
import { deleteTrashedFile, trashedFile } from "@/lib/trash/media-file";
import { TRASH_LABEL, TRASH_PERMISSION, type TrashEntity } from "@/lib/trash/policy";

// Restore and delete-forever for /admin/trash. Each action checks the
// permission that deleted that kind of item (lib/trash/policy.ts), so a media
// manager cannot restore a post. An item the user may not act on answers
// like a missing one, so the trash never confirms what it holds.

const TRASH_PATH = "/admin/trash";
const GONE = "This item is no longer in the trash.";

/** Where each kind of item is listed in the admin panel. */
const ADMIN_PATH: Record<TrashEntity, string> = {
  Post: "/admin/blog",
  MediaAsset: "/admin/media",
};

async function invalidatePublic(item: TrashItem): Promise<void> {
  switch (item.entityType) {
    case "Post": {
      const slug = (item.data as { post?: { slug?: string } }).post?.slug;
      if (slug) await invalidate(forPost(slug));
      return;
    }
    case "MediaAsset":
      return;
  }
}

/** A restored row's media references count again, so its images cannot be deleted under it. */
async function resyncUsage(tx: Repos, item: TrashItem): Promise<void> {
  if (item.entityType === "Post") {
    const post = await tx.posts.find(item.entityId);
    if (!post) return;
    // Its slug is a real post again, not a redirect to another one.
    await tx.posts.releaseSlug(post.slug);
    await syncPostMediaUsage(tx, post.id, post.coverMediaId, post.content);
    return;
  }
}

/** The item named by the form, when this user may act on its kind. */
async function itemFor(user: AuthUser, formData: FormData): Promise<TrashItem | null> {
  const id = String(formData.get("id") ?? "");
  if (!id) return null;
  const item = await repos.trash.find(id);
  return item && hasPermission(user, TRASH_PERMISSION[item.entityType]) ? item : null;
}

export async function restoreTrashAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction(null);
  if (!auth.ok) return fail(auth.error);

  try {
    const item = await itemFor(auth.user, formData);
    if (!item) return fail(GONE);

    const restored = await withTx(async (tx) => {
      // Removing first makes a concurrent second restore of the same item a no-op.
      if ((await tx.trash.remove([item.id])) === 0) return false;
      await tx.trash.restore(item.entityType, item.data);
      await resyncUsage(tx, item);
      await audit(
        {
          action: "trash.restored",
          actor: auth.user,
          entityType: item.entityType,
          entityId: item.entityId,
          meta: { label: item.label, deletedAt: item.deletedAt.toISOString() },
        },
        tx
      );
      return true;
    });
    if (!restored) return fail(GONE);

    await invalidatePublic(item);
    revalidatePath(TRASH_PATH);
    revalidatePath(ADMIN_PATH[item.entityType]);
    return done(`${TRASH_LABEL[item.entityType]} restored.`);
  } catch (error) {
    if (error instanceof UniqueViolation) {
      return fail("Something else now uses its slug or key. Rename or delete that first, then restore this.");
    }
    if (error instanceof TrashRestoreError) return fail(error.message);
    log.error("trash restore failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("Something went wrong. Please try again.");
  }
}

export async function purgeTrashAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction(null);
  if (!auth.ok) return fail(auth.error);

  try {
    const item = await itemFor(auth.user, formData);
    if (!item) return fail(GONE);

    // The file goes first: if its account refuses, the snapshot stays so the
    // purge can be retried, instead of leaving an orphaned file behind.
    const file = item.entityType === "MediaAsset" ? trashedFile(item.data) : null;
    if (file) await deleteTrashedFile(file);

    await withTx(async (tx) => {
      if ((await tx.trash.remove([item.id])) === 0) return;
      await audit(
        {
          action: "trash.purged",
          actor: auth.user,
          entityType: item.entityType,
          entityId: item.entityId,
          meta: { label: item.label },
        },
        tx
      );
    });
    revalidatePath(TRASH_PATH);
    return done(`${TRASH_LABEL[item.entityType]} deleted forever.`);
  } catch (error) {
    log.error("trash purge failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("Something went wrong. Please try again.");
  }
}
