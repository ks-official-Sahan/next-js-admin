import "server-only";

import { repos, type Repos } from "@/lib/data";
import { invalidate } from "@/lib/cache/invalidate";
import { forPostList } from "@/lib/cache/plan";
import { audit } from "@/lib/admin/audit";
import { REVISIONS_KEPT } from "@sahan-sac/blog-kit/revisions";
import { log } from "@/lib/log";

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
      invalidate(forPostList());
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
        action: "audit.exported",
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
): Promise<{ deleted: number; auditRows: number; revisions: number; error?: string }> {
  const [auditResult, revisionResult] = await Promise.all([auditPruneJob(options), revisionPruneJob()]);
  return {
    deleted: auditResult.deleted + revisionResult.deleted,
    auditRows: auditResult.deleted,
    revisions: revisionResult.deleted,
    ...(auditResult.error || revisionResult.error ? { error: auditResult.error ?? revisionResult.error } : {}),
  };
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
