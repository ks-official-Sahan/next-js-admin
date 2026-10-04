"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorizeAction } from "@/lib/actions/guard";
import type { ActionState } from "@/lib/actions/state";
import { done, fail, fieldErrorsFrom } from "@/lib/actions/state";
import { audit, auditMany } from "@/lib/admin/audit";
import { hasPermission } from "@/lib/auth/dal";
import { invalidate } from "@/lib/cache/invalidate";
import { forPost, forPostList, mergePlans } from "@/lib/cache/plan";
import { isDbUnavailable, repos, withTx } from "@/lib/data";
import { UniqueViolation } from "@/lib/data/errors";
import { extractText, sanitizeRich } from "@/lib/cms/rich-text";
import { postInputSchema, publishActionSchema } from "@/lib/blog/schema";
import { parseSubmittedUpdatedAt, UPDATE_CONFLICT_MESSAGE } from "@sahan-sac/blog-kit/concurrency";
import { computeReadMinutes } from "@sahan-sac/blog-kit/readtime";
import { parseSnapshot, sameSnapshot, snapshotOf, type PostSnapshot } from "@sahan-sac/blog-kit/revisions";
import { log } from "@/lib/log";

// Blog CRUD and status actions (design notes, Step 12). Draft
// create/update/read use editBlog; every status change (publish, schedule,
// unpublish, archive) and delete use publishBlog / deleteBlog. `content`
// (raw editor HTML) is re-sanitized on every save into `contentHtml` and
// `contentText` — the client-sent copies of those two fields are never
// trusted, even if the RichEditor already sanitized on its side. A status
// change that touches PUBLISHED invalidates the public cache in the same
// call that commits the change.

const ADMIN_LIST_PATH = "/admin/blog";

/** Thrown inside updatePostAction's transaction when the conditional
 * update matches no row — someone else changed the post since the
 * editor loaded it. Caught by the surrounding try/catch, same "abort the
 * transaction with a typed reason" idiom as lib/cms/service.ts's `Abort`. */
class UpdateConflictError extends Error {}

// A UniqueViolation maps a slug collision to a field error instead of a 500,
// whether it came from the slugTaken() pre-check missing a race or a row
// edited directly elsewhere. isDbUnavailable means the change was rolled back
// because the database was too slow, so the admin can simply retry.

const DB_SLOW_MESSAGE = "The database did not respond in time, so nothing was saved. Your changes are still in the editor: try again.";
const UNEXPECTED_MESSAGE = "Something went wrong. Please try again.";

function computed(content: string) {
  const contentHtml = sanitizeRich(content);
  const contentText = extractText(contentHtml);
  return { contentHtml, contentText, readMinutes: computeReadMinutes(contentText) };
}

async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const ownerId = await repos.posts.idBySlug(slug);
  return Boolean(ownerId && ownerId !== excludeId);
}

function payloadFrom(formData: FormData): Record<string, unknown> {
  const raw = Object.fromEntries(formData.entries());
  const tags = raw.tags;
  return {
    ...raw,
    tags: typeof tags === "string" && tags.length > 0 ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
  };
}

/**
 * Resolves the create form's publish intent into a status/publishAt/
 * publishedAt triple. `publishIntent` beyond "draft" is only honored for an
 * actor who holds publishBlog — editBlog alone (already required by
 * authorizeAction above) can create and edit a draft, never publish one, so
 * an editor submitting a forged "publish" intent silently gets a draft
 * instead of an error, same as the intent field being absent.
 */
function resolveCreateStatus(
  formData: FormData,
  canPublish: boolean
): { status: "DRAFT" | "SCHEDULED" | "PUBLISHED"; publishAt: Date | null; publishedAt: Date | null } | { error: string } {
  const intent = String(formData.get("publishIntent") ?? "draft");
  if (intent !== "publish" || !canPublish) return { status: "DRAFT", publishAt: null, publishedAt: null };

  const scheduleRaw = String(formData.get("scheduleAt") ?? "").trim();
  if (!scheduleRaw) return { status: "PUBLISHED", publishAt: null, publishedAt: new Date() };

  const scheduleDate = new Date(scheduleRaw);
  if (Number.isNaN(scheduleDate.getTime())) return { error: "Invalid schedule date." };
  if (scheduleDate.getTime() <= Date.now()) return { status: "PUBLISHED", publishAt: null, publishedAt: new Date() };
  return { status: "SCHEDULED", publishAt: scheduleDate, publishedAt: null };
}

export async function createPostAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("editBlog");
  if (!auth.ok) return fail(auth.error);

  const parsed = postInputSchema.safeParse(payloadFrom(formData));
  if (!parsed.success) return fail("Some fields need attention.", fieldErrorsFrom(parsed.error.issues));

  if (await slugTaken(parsed.data.slug)) {
    return fail("Some fields need attention.", { slug: "This slug is already in use." });
  }

  const resolved = resolveCreateStatus(formData, hasPermission(auth.user, "publishBlog"));
  if ("error" in resolved) return fail(resolved.error);

  let createdId: string;
  try {
    const extra = computed(parsed.data.content);
    const created = await withTx(async (tx) => {
      const row = await tx.posts.create({
        slug: parsed.data.slug,
        title: parsed.data.title,
        excerpt: parsed.data.excerpt || null,
        content: parsed.data.content,
        contentHtml: extra.contentHtml,
        contentText: extra.contentText,
        readMinutes: extra.readMinutes,
        topic: parsed.data.topic,
        tags: parsed.data.tags,
        coverMediaId: parsed.data.coverMediaId || null,
        coverAlt: parsed.data.coverAlt || null,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
        canonicalUrl: parsed.data.canonicalUrl || null,
        noindex: parsed.data.noindex,
        status: resolved.status,
        publishAt: resolved.publishAt,
        publishedAt: resolved.publishedAt,
        generatedByAI: String(formData.get("generatedByAI") ?? "") === "1",
        authorId: auth.user.id,
      });
      await audit(
        {
          action: resolved.status === "DRAFT" ? "post.created" : "post.created.published",
          actor: auth.user,
          entityType: "Post",
          entityId: row.id,
          before: null,
          after: row,
        },
        tx
      );
      return row;
    });
    if (resolved.status === "PUBLISHED") invalidate(forPost(created.slug));
    revalidatePath(ADMIN_LIST_PATH);
    createdId = created.id;
  } catch (error) {
    if (error instanceof UniqueViolation) {
      return fail("Some fields need attention.", { slug: "This slug is already in use." });
    }
    log.error("create post failed", { error: error instanceof Error ? error.message : String(error) });
    return fail(isDbUnavailable(error) ? DB_SLOW_MESSAGE : UNEXPECTED_MESSAGE);
  }
  // redirect() throws internally; it must not be inside the try/catch above.
  redirect(`/admin/blog/${createdId}`);
}

/**
 * Re-sanitizes arbitrary editor HTML through the exact function the public
 * site renders with (lib/cms/rich-text.ts's sanitizeRich), so the "Live
 * preview" pane shows precisely what /updates/[slug] would render — never a
 * client-side approximation of the allowlist. Read-only: no mutation, so
 * nothing to audit, but every Server Action still authorizes first.
 */
export async function previewPostHtmlAction(html: string): Promise<string> {
  const auth = await authorizeAction("editBlog");
  if (!auth.ok) return "";
  return sanitizeRich(typeof html === "string" ? html.slice(0, 200_000) : "");
}

/**
 * Optimistic concurrency (design notes, Step 12 hardening): the
 * edit form carries the post's `updatedAt` in a hidden field
 * (BlogEditorForm), and the actual write is conditional on that timestamp
 * still matching — an update filtered on it inside the transaction, never a
 * bare one by id, so a save that lands after someone else's edit touches zero rows
 * instead of overwriting their text. On a conflict, no audit row is written
 * (the transaction throws before reaching audit()) and the caller's typed
 * text is untouched — ActionForm's own state keeps it.
 */
export async function updatePostAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("editBlog");
  if (!auth.ok) return fail(auth.error);

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Post ID is required.");

  const submittedUpdatedAt = parseSubmittedUpdatedAt(formData.get("updatedAt"));
  if (!submittedUpdatedAt) {
    return fail("Missing version info. Reload the page and try again.");
  }

  const parsed = postInputSchema.safeParse(payloadFrom(formData));
  if (!parsed.success) return fail("Some fields need attention.", fieldErrorsFrom(parsed.error.issues));

  try {
    const before = await repos.posts.find(id);
    if (!before) return fail("Post not found.");

    if (parsed.data.slug !== before.slug && (await slugTaken(parsed.data.slug, id))) {
      return fail("Some fields need attention.", { slug: "This slug is already in use." });
    }

    const next: PostSnapshot = {
      slug: parsed.data.slug,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt || null,
      content: parsed.data.content,
      topic: parsed.data.topic,
      tags: parsed.data.tags,
      coverMediaId: parsed.data.coverMediaId || null,
      coverAlt: parsed.data.coverAlt || null,
      seoTitle: parsed.data.seoTitle || null,
      seoDescription: parsed.data.seoDescription || null,
      canonicalUrl: parsed.data.canonicalUrl || null,
      noindex: parsed.data.noindex,
    };
    const previous = snapshotOf(before);
    const extra = computed(parsed.data.content);
    const updated = await withTx(async (tx) => {
      // The updatedAt check is the concurrency check: no match means someone
      // else saved since this editor loaded, so nothing is written.
      const row = await tx.posts.updateIfUnchanged(id, submittedUpdatedAt, { ...next, ...extra });
      if (!row) throw new UpdateConflictError();
      // A save that changed nothing editable leaves no revision behind.
      if (!sameSnapshot(previous, next)) {
        await tx.postRevisions.create({ postId: id, title: previous.title, data: previous, reason: "update", createdById: auth.user.id });
      }
      await audit(
        { action: "post.updated", actor: auth.user, entityType: "Post", entityId: id, before, after: row },
        tx
      );
      return row;
    });

    // Editing the text of a post that is already public must refresh what
    // visitors see; a draft edit has nothing public to invalidate.
    if (before.status === "PUBLISHED" || updated.slug !== before.slug) {
      invalidate(forPost(before.slug));
      if (updated.slug !== before.slug) invalidate(forPost(updated.slug));
    }
    revalidatePath(ADMIN_LIST_PATH);
    // The fresh updatedAt travels back so the form can re-arm its hidden
    // field — otherwise a second save right after this one would report a
    // false conflict against the timestamp it just made stale itself.
    return { ...done("Post updated."), updatedAt: updated.updatedAt.toISOString() };
  } catch (error) {
    if (error instanceof UpdateConflictError) return fail(UPDATE_CONFLICT_MESSAGE);
    if (error instanceof UniqueViolation) {
      return fail("Some fields need attention.", { slug: "This slug is already in use." });
    }
    log.error("update post failed", { error: error instanceof Error ? error.message : String(error) });
    return fail(isDbUnavailable(error) ? DB_SLOW_MESSAGE : UNEXPECTED_MESSAGE);
  }
}

/**
 * Puts an earlier revision's fields back. The version being replaced is
 * stored as a revision first (reason "restore"), so a restore can itself be
 * undone. Same concurrency rule as updatePostAction: the write is conditional
 * on the updatedAt this action read, so a save racing the restore wins cleanly
 * instead of being overwritten.
 */
export async function restorePostRevisionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("editBlog");
  if (!auth.ok) return fail(auth.error);

  const postId = String(formData.get("postId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  if (!postId || !revisionId) return fail("Revision not found.");

  try {
    const [before, revision] = await Promise.all([
      repos.posts.find(postId),
      repos.postRevisions.findData(revisionId, postId),
    ]);
    if (!before || !revision) return fail("Revision not found.");

    const snapshot = parseSnapshot(revision.data);
    if (!snapshot) return fail("This revision can no longer be restored.");
    if (snapshot.slug !== before.slug && (await slugTaken(snapshot.slug, postId))) {
      return fail("Another post now uses this revision's slug. Change that post's slug first.");
    }
    // The cover may have been deleted from the library since; restore without it.
    if (snapshot.coverMediaId) {
      const cover = await repos.media.find(snapshot.coverMediaId);
      if (!cover) snapshot.coverMediaId = null;
    }

    const extra = computed(snapshot.content);
    const restored = await withTx(async (tx) => {
      const row = await tx.posts.updateIfUnchanged(postId, before.updatedAt, { ...snapshot, ...extra });
      if (!row) throw new UpdateConflictError();
      await tx.postRevisions.create({ postId, title: before.title, data: snapshotOf(before), reason: "restore", createdById: auth.user.id });
      await audit(
        {
          action: "post.restored",
          actor: auth.user,
          entityType: "Post",
          entityId: postId,
          before,
          after: row,
          meta: { revisionId },
        },
        tx
      );
      return row;
    });

    if (before.status === "PUBLISHED" || restored.slug !== before.slug) {
      invalidate(forPost(before.slug));
      if (restored.slug !== before.slug) invalidate(forPost(restored.slug));
    }
    revalidatePath(ADMIN_LIST_PATH);
    revalidatePath(`${ADMIN_LIST_PATH}/${postId}`);
    return { ...done("Revision restored."), updatedAt: restored.updatedAt.toISOString() };
  } catch (error) {
    if (error instanceof UpdateConflictError) return fail(UPDATE_CONFLICT_MESSAGE);
    if (error instanceof UniqueViolation) return fail("Another post now uses this revision's slug.");
    log.error("restore post revision failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("Something went wrong. Please try again.");
  }
}

/** Deletes one post (audit row in the same transaction) and invalidates the
 * public cache if it was ever visible. Shared by deletePostAction and
 * bulkDeletePostsAction, same split as applyStatus/setPostStatusAction. */
async function deleteOne(id: string, actor: { id: string; email: string }): Promise<boolean> {
  const before = await repos.posts.find(id);
  if (!before) return false;

  await withTx(async (tx) => {
    await tx.posts.delete(id);
    await audit({ action: "post.deleted", actor, entityType: "Post", entityId: id, before, after: null }, tx);
  });

  if (before.status === "PUBLISHED" || before.status === "SCHEDULED") invalidate(forPost(before.slug));
  return true;
}

export async function deletePostAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("deleteBlog");
  if (!auth.ok) return fail(auth.error);

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Post ID is required.");

  try {
    const deleted = await deleteOne(id, auth.user);
    if (!deleted) return fail("Post not found.");

    revalidatePath(ADMIN_LIST_PATH);
    return done("Post deleted.");
  } catch (error) {
    log.error("delete post failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("Something went wrong. Please try again.");
  }
}

type StatusAction = "publish" | "schedule" | "unpublish" | "archive";

const STATUS_AUDIT_ACTION: Record<StatusAction, string> = {
  publish: "post.published",
  schedule: "post.scheduled",
  unpublish: "post.unpublished",
  archive: "post.archived",
};

/** The columns a status change writes. */
function statusData(action: StatusAction, publishAt: Date | null) {
  return action === "publish"
    ? { status: "PUBLISHED" as const, publishAt: null, publishedAt: new Date() }
    : action === "schedule"
      ? { status: "SCHEDULED" as const, publishAt, publishedAt: null }
      : action === "unpublish"
        ? { status: "DRAFT" as const, publishAt: null, publishedAt: null }
        : { status: "ARCHIVED" as const, publishAt: null };
}

async function applyStatus(
  id: string,
  action: StatusAction,
  publishAt: Date | null,
  actor: { id: string; email: string }
): Promise<ActionState> {
  try {
    const before = await repos.posts.find(id);
    if (!before) return fail("Post not found.");

    const data = statusData(action, publishAt);

    const updated = await withTx(async (tx) => {
      const row = await tx.posts.update(id, data);
      await audit(
        {
          action: STATUS_AUDIT_ACTION[action],
          actor,
          entityType: "Post",
          entityId: id,
          before,
          after: row,
        },
        tx
      );
      return row;
    });

    // Any status change touching PUBLISHED (becoming it, or leaving it) must
    // refresh the public cache; a draft <-> scheduled transition has nothing
    // public to invalidate yet.
    if (before.status === "PUBLISHED" || updated.status === "PUBLISHED") {
      invalidate(forPost(before.slug));
    }
    revalidatePath(ADMIN_LIST_PATH);
    // The edit page shows the status too; without this its controls stay stale until a reload.
    revalidatePath(`${ADMIN_LIST_PATH}/${id}`);

    const messages = {
      publish: "Post published.",
      schedule: "Post scheduled.",
      unpublish: "Post moved back to draft.",
      archive: "Post archived.",
    };
    return done(messages[action]);
  } catch (error) {
    log.error("post status change failed", { error: error instanceof Error ? error.message : String(error), action });
    return fail("Something went wrong. Please try again.");
  }
}

export async function setPostStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("publishBlog");
  if (!auth.ok) return fail(auth.error);

  const id = String(formData.get("id") ?? "");
  const actionParsed = publishActionSchema.safeParse(formData.get("action"));
  if (!id || !actionParsed.success) return fail("Invalid request.");

  let publishAt: Date | null = null;
  if (actionParsed.data === "schedule") {
    const raw = String(formData.get("publishAt") ?? "");
    const parsedDate = new Date(raw);
    if (!raw || Number.isNaN(parsedDate.getTime())) {
      return fail("Some fields need attention.", { publishAt: "A valid publish date and time is required." });
    }
    publishAt = parsedDate;
  }

  return applyStatus(id, actionParsed.data, publishAt, auth.user);
}

const MAX_BULK = 100;

/** Shared by every bulk action: the `ids` hidden field is a JSON array of
 * strings, capped at MAX_BULK. `fail(...)` on anything else, else the list. */
function parseBulkIds(formData: FormData): { ok: true; ids: string[] } | { ok: false; state: ActionState } {
  const idsRaw = String(formData.get("ids") ?? "");
  let ids: string[];
  try {
    ids = JSON.parse(idsRaw);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("bad shape");
  } catch {
    return { ok: false, state: fail("Invalid selection.") };
  }
  if (ids.length === 0) return { ok: false, state: fail("Select at least one post.") };
  if (ids.length > MAX_BULK) return { ok: false, state: fail(`Select ${MAX_BULK} posts or fewer at a time.`) };
  return { ok: true, ids };
}

export async function bulkPostStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("publishBlog");
  if (!auth.ok) return fail(auth.error);

  const actionParsed = publishActionSchema.safeParse(formData.get("action"));
  if (!actionParsed.success || actionParsed.data === "schedule") {
    return fail("Bulk schedule is not supported; open each post to schedule it.");
  }

  const parsedIds = parseBulkIds(formData);
  if (!parsedIds.ok) return parsedIds.state;

  // One read, one write and one audit insert for the whole selection (not
  // three round trips per post), all or nothing in a single transaction.
  const action = actionParsed.data;
  try {
    const befores = await repos.posts.findMany(parsedIds.ids);
    if (befores.length === 0) return fail("None of the selected posts exist any more.");
    const data = statusData(action, null);
    const ids = befores.map((post) => post.id);

    await withTx(async (tx) => {
      await tx.posts.updateMany(ids, data);
      await auditMany(
        befores.map((before) => ({
          action: STATUS_AUDIT_ACTION[action],
          actor: auth.user,
          entityType: "Post",
          entityId: before.id,
          before,
          after: { ...before, ...data },
        })),
        tx
      );
    });

    // Anything that was or now is public needs its pages refreshed: one
    // merged plan, so shared tags and paths are revalidated once, not per post.
    invalidate(
      mergePlans(
        befores
          .filter((before) => before.status === "PUBLISHED" || data.status === "PUBLISHED")
          .map((before) => forPost(before.slug))
      )
    );
    revalidatePath(ADMIN_LIST_PATH);
    return done(`Updated ${befores.length} of ${parsedIds.ids.length} posts.`);
  } catch (error) {
    log.error("bulk post status change failed", { error: error instanceof Error ? error.message : String(error), action });
    return fail("Something went wrong. Nothing was changed.");
  }
}

/** Deletes several posts at once (the confirmed selection from
 * BlogListClient's bulk toolbar). Requires deleteBlog, same as the
 * single-post delete on the edit page — publishBlog alone (bulkPostStatusAction's
 * gate) must not be able to destroy rows. */
export async function bulkDeletePostsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("deleteBlog");
  if (!auth.ok) return fail(auth.error);

  const parsedIds = parseBulkIds(formData);
  if (!parsedIds.ok) return parsedIds.state;

  // Same shape as the bulk status change: one read, one delete, one audit insert.
  try {
    const befores = await repos.posts.findMany(parsedIds.ids);
    if (befores.length === 0) return fail("None of the selected posts exist any more.");

    await withTx(async (tx) => {
      await tx.posts.deleteMany(befores.map((post) => post.id));
      await auditMany(
        befores.map((before) => ({
          action: "post.deleted",
          actor: auth.user,
          entityType: "Post",
          entityId: before.id,
          before,
          after: null,
        })),
        tx
      );
    });

    invalidate(
      mergePlans(
        befores
          .filter((before) => before.status === "PUBLISHED" || before.status === "SCHEDULED")
          .map((before) => forPost(before.slug))
      )
    );
    revalidatePath(ADMIN_LIST_PATH);
    return done(`Deleted ${befores.length} of ${parsedIds.ids.length} posts.`);
  } catch (error) {
    log.error("bulk delete posts failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("Something went wrong. Nothing was deleted.");
  }
}
