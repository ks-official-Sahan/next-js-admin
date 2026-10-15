import "server-only";

import { repos, type Repos } from "@/lib/data";
import { invalidate } from "@/lib/cache/invalidate";
import { forPostList } from "@/lib/cache/plan";
import { audit } from "@/lib/admin/audit";
import { REVISIONS_KEPT } from "@sahan-sac/blog-kit/revisions";
import { HISTORY_KEPT } from "@/lib/cms/versions";
import { log } from "@/lib/log";
import { deleteTrashedFile, trashedFile, type TrashedFile } from "@/lib/trash/media-file";
import { trashCutoff } from "@/lib/trash/policy";
import { deliverByIds } from "@/lib/webhooks/dispatch";
import { DELIVERY_KEEP_DAYS } from "@/lib/webhooks/policy";

// Shared cron job logic, called by both the /api/cron/* routes (automatic,
// CRON_SECRET) and the manual "run now" action on the settings screen
// (manageCron, or manageSettings for audit-prune). Each job accepts the
// repositories it needs (lib/data) so it can be unit tested with a fake, per
// the project rule that tests never touch the real database. Design:
// design notes, Step 16.

export const DEFAULT_AUDIT_RETENTION_DAYS = 365;

/** Audit prune deletes in batches of this many rows, oldest first... */
export const AUDIT_PRUNE_BATCH = 2_000;
/** ...and stops after this long, well inside the 60 s function limit. The
 * next run continues where this one stopped. */
const AUDIT_PRUNE_BUDGET_MS = 40_000;

/** Deleted rows younger than this are kept even once expired or revoked, so a
 * session or token that just expired is still visible for a moment on the
 * sessions screen and cannot be deleted mid-request. */
export const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

export type BlogPublishDb = Pick<Repos, "maintenance">;
export type SessionCleanupDb = Pick<Repos, "maintenance">;
export type RevisionPruneDb = Pick<Repos, "maintenance">;
export type AuditPruneDb = Pick<Repos, "maintenance" | "audit">;

/**
 * Publish scheduled blog posts that have reached their publish time.
 * Flips Post.status from SCHEDULED to PUBLISHED and sets publishedAt.
 * Idempotent: a post already PUBLISHED never matches the where clause again.
 */
export async function blogPublishJob(client: BlogPublishDb = repos): Promise<{ published: number; error?: string }> {
  try {
    const now = new Date();

    // One statement: the count it returns is the "anything to do?" answer.
    const result = { count: await client.maintenance.publishDuePosts(now) };

    if (result.count === 0) {
      log.info("blog publish cron: no posts to publish");
      return { published: 0 };
    }

    // A cache-invalidation failure (for example: called outside a Next.js
    // request scope, or a transient revalidateTag error) must never be
    // reported as "nothing was published" when the database write already
    // succeeded, so it is isolated from the job's own result.
    try {
      await invalidate(forPostList());
    } catch (err) {
      log.warn("blog publish cron: cache invalidation failed", { error: String(err) });
    }

    log.info("blog publish cron: published posts", { count: result.count });
    return { published: result.count };
  } catch (err) {
    const error = String(err);
    log.error("blog publish cron failed", { error });
    return { published: 0, error };
  }
}

/**
 * Clean up expired and revoked sessions, and expired auth tokens and MFA
 * challenges, all past a grace period so nothing is deleted the moment it
 * lapses. Idempotent: a second run finds nothing left to delete.
 */
export async function sessionCleanupJob(client: SessionCleanupDb = repos): Promise<{ deleted: number; error?: string }> {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - CLEANUP_GRACE_MS);

    // Three independent deletes, run together (one round trip of latency).
    const [sessions, tokens, mfa] = await Promise.all([
      // Sessions: expired past the grace period, or revoked past the grace period.
      client.maintenance.deleteEndedSessions(cutoff),
      // Invite and reset tokens: expired past the grace period. A used or revoked
      // token with no expiry change stays until it too ages out, which keeps a
      // short audit trail of recently accepted invites.
      client.maintenance.deleteExpiredAuthTokens(cutoff),
      // MFA challenges: expired past the grace period.
      client.maintenance.deleteExpiredMfaChallenges(cutoff),
    ]);

    const totalDeleted = sessions + tokens + mfa;

    log.info("session cleanup cron: deleted expired records", { sessions, tokens, mfa, total: totalDeleted });

    return { deleted: totalDeleted };
  } catch (err) {
    const error = String(err);
    log.error("session cleanup cron failed", { error });
    return { deleted: 0, error };
  }
}

/**
 * Prune audit log rows older than the retention period (default 365 days).
 * Writes an audit row for the prune itself, so the deletion is traceable even
 * though most of what it deleted no longer exists to show a "before".
 */
export async function auditPruneJob(
  options: { retentionDays?: number } = {},
  client: AuditPruneDb = repos
): Promise<{ deleted: number; error?: string }> {
  try {
    const retentionDays = options.retentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS;
    const now = new Date();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    // Batches, not one DELETE: a large backlog (the first run, or a cron gap)
    // would otherwise be one long statement that can outlive the function.
    let deleted = 0;
    const started = Date.now();
    for (;;) {
      const batch = await client.maintenance.oldestAuditIdsBefore(cutoff, AUDIT_PRUNE_BATCH);
      if (batch.length === 0) break;
      deleted += await client.maintenance.deleteAuditRows(batch);
      if (batch.length < AUDIT_PRUNE_BATCH || Date.now() - started > AUDIT_PRUNE_BUDGET_MS) break;
    }
    const result = { count: deleted };
    if (result.count === 0) {
      log.info("audit prune cron: no old audit entries to delete");
      return { deleted: 0 };
    }

    await audit(
      {
        action: "audit.pruned",
        entityType: "AuditLog",
        meta: { op: "prune", deletedRows: result.count, retentionDays },
      },
      client
    );

    log.info("audit prune cron: pruned old audit entries", { count: result.count, retentionDays });
    return { deleted: result.count };
  } catch (err) {
    const error = String(err);
    log.error("audit prune cron failed", { error });
    return { deleted: 0, error };
  }
}

/** The daily audit-prune schedule: old audit rows and surplus post revisions, pruned together. */
export async function housekeepingPruneJob(
  options: { retentionDays?: number } = {}
): Promise<{ deleted: number; auditRows: number; revisions: number; sectionVersions: number; trash: number; webhooks: number; error?: string }> {
  const [auditResult, revisionResult, sectionResult, trashResult, webhookResult] = await Promise.all([
    auditPruneJob(options),
    revisionPruneJob(),
    sectionPruneJob(),
    trashPurgeJob(),
    webhookRetryJob(),
  ]);
  const error = auditResult.error ?? revisionResult.error ?? sectionResult.error ?? trashResult.error ?? webhookResult.error;
  return {
    deleted: auditResult.deleted + revisionResult.deleted + sectionResult.deleted + trashResult.deleted + webhookResult.deleted,
    auditRows: auditResult.deleted,
    revisions: revisionResult.deleted,
    sectionVersions: sectionResult.deleted,
    trash: trashResult.deleted,
    webhooks: webhookResult.retried,
    ...(error ? { error } : {}),
  };
}

export type WebhookRetryDb = Pick<Repos, "webhooks">;

/** Most deliveries one run retries; the rest wait for the next run. */
export const WEBHOOK_RETRY_BATCH = 100;

/**
 * Retries webhook deliveries whose next attempt is due (Vercel Hobby allows
 * only a daily cron, so later retries land on this run), then prunes
 * finished delivery history older than DELIVERY_KEEP_DAYS.
 */
export async function webhookRetryJob(
  client: WebhookRetryDb = repos,
  deliver: (ids: string[]) => Promise<unknown> = deliverByIds,
  now = Date.now()
): Promise<{ retried: number; deleted: number; error?: string }> {
  try {
    const due = await client.webhooks.dueIds(new Date(now), WEBHOOK_RETRY_BATCH);
    if (due.length > 0) await deliver(due);
    const deleted = await client.webhooks.pruneDeliveries(new Date(now - DELIVERY_KEEP_DAYS * 24 * 60 * 60 * 1000));
    if (due.length > 0 || deleted > 0) log.info("webhook cron: retried and pruned deliveries", { retried: due.length, pruned: deleted });
    return { retried: due.length, deleted };
  } catch (err) {
    const error = String(err);
    log.error("webhook cron failed", { error });
    return { retried: 0, deleted: 0, error };
  }
}

export type TrashPurgeDb = Pick<Repos, "trash" | "audit">;

/** Most items one run purges; the next daily run continues. */
export const TRASH_PURGE_BATCH = 200;

/**
 * Deletes trash items past TRASH_DAYS for good, with the stored file of
 * each purged media asset. A file its account refuses keeps its snapshot, so
 * the next run retries it rather than orphaning the file.
 */
export async function trashPurgeJob(
  client: TrashPurgeDb = repos,
  deleteFile: (file: TrashedFile) => Promise<void> = deleteTrashedFile,
  now = Date.now()
): Promise<{ deleted: number; error?: string }> {
  try {
    const expired = await client.trash.expired(trashCutoff(now), TRASH_PURGE_BATCH);
    if (expired.length === 0) return { deleted: 0 };

    const files = await Promise.allSettled(
      expired.map(async (item) => {
        const file = item.entityType === "MediaAsset" ? trashedFile(item.data) : null;
        if (file) await deleteFile(file);
        return item.id;
      })
    );
    const purgeable = files.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const kept = files.length - purgeable.length;
    if (kept > 0) log.warn("trash purge cron: media files kept for retry", { count: kept });

    const deleted = await client.trash.remove(purgeable);
    if (deleted > 0) {
      await audit({ action: "trash.purged", entityType: "TrashItem", meta: { op: "expired", count: deleted } }, client);
      log.info("trash purge cron: purged expired trash", { count: deleted });
    }
    return { deleted };
  } catch (err) {
    const error = String(err);
    log.error("trash purge cron failed", { error });
    return { deleted: 0, error };
  }
}

/**
 * Keeps each CMS section's newest HISTORY_KEPT superseded versions, in one
 * statement. Drafts and published rows are never touched. Idempotent.
 */
export async function sectionPruneJob(client: RevisionPruneDb = repos): Promise<{ deleted: number; error?: string }> {
  try {
    const deleted = await client.maintenance.pruneSupersededBlocks(HISTORY_KEPT);
    if (deleted > 0) log.info("section prune cron: pruned old section versions", { count: deleted, kept: HISTORY_KEPT });
    return { deleted };
  } catch (err) {
    const error = String(err);
    log.error("section prune cron failed", { error });
    return { deleted: 0, error };
  }
}

/**
 * Keeps only the newest REVISIONS_KEPT revisions of each post, in one
 * statement however many posts have history. Idempotent.
 */
export async function revisionPruneJob(client: RevisionPruneDb = repos): Promise<{ deleted: number; error?: string }> {
  try {
    const deleted = await client.maintenance.pruneRevisions(REVISIONS_KEPT);
    if (deleted > 0) log.info("revision prune cron: pruned old post revisions", { count: deleted, kept: REVISIONS_KEPT });
    return { deleted };
  } catch (err) {
    const error = String(err);
    log.error("revision prune cron failed", { error });
    return { deleted: 0, error };
  }
}
