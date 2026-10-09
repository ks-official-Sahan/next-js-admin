import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import type { AuditRow } from "@/lib/data/audit";
import type { MaintenanceRepo } from "@/lib/data/maintenance";

import { AUDIT_PRUNE_BATCH, auditPruneJob, blogPublishJob, revisionPruneJob, sessionCleanupJob, CLEANUP_GRACE_MS } from "./jobs";

// In-memory maintenance repositories. Each keeps the repository contract
// (lib/data/maintenance.ts) over plain arrays, which is enough to prove the
// job logic (cutoffs, batching, idempotency, counts) without a database. The
// Prisma queries behind the contract are tested in lib/data/prisma/maintenance.test.ts.

type Post = { id: string; status: string; publishAt: Date | null; publishedAt: Date | null };
type Session = { expiresAt: Date; revokedAt: Date | null };
type Expiring = { expiresAt: Date };
type AuditLogRow = { id?: string; createdAt: Date };

function unused(): never {
  throw new Error("not used by this job");
}

function removeWhere<T>(rows: T[], drop: (row: T) => boolean): number {
  const kept = rows.filter((row) => !drop(row));
  const count = rows.length - kept.length;
  rows.splice(0, rows.length, ...kept);
  return count;
}

function fakeMaintenance(data: {
  posts?: Post[];
  sessions?: Session[];
  tokens?: Expiring[];
  mfa?: Expiring[];
  audit?: AuditLogRow[];
}): MaintenanceRepo {
  const { posts = [], sessions = [], tokens = [], mfa = [], audit = [] } = data;
  audit.forEach((row, index) => (row.id ??= `row-${index}`));
  return {
    async publishDuePosts(now) {
      let count = 0;
      for (const post of posts) {
        if (post.status === "SCHEDULED" && post.publishAt && post.publishAt <= now) {
          post.status = "PUBLISHED";
          post.publishedAt = now;
          count++;
        }
      }
      return count;
    },
    async deleteEndedSessions(cutoff) {
      return removeWhere(sessions, (s) => s.expiresAt <= cutoff || (s.revokedAt !== null && s.revokedAt <= cutoff));
    },
    async deleteExpiredAuthTokens(cutoff) {
      return removeWhere(tokens, (t) => t.expiresAt <= cutoff);
    },
    async deleteExpiredMfaChallenges(cutoff) {
      return removeWhere(mfa, (m) => m.expiresAt <= cutoff);
    },
    async oldestAuditIdsBefore(cutoff, take) {
      return audit
        .filter((row) => row.createdAt < cutoff)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, take)
        .map((row) => row.id!);
    },
    async deleteAuditRows(ids) {
      const drop = new Set(ids);
      return removeWhere(audit, (row) => drop.has(row.id!));
    },
    pruneRevisions: unused,
    ping: unused,
  };
}

describe("blogPublishJob", () => {
  test("publishes scheduled posts whose time has come", async () => {
    const past = new Date(Date.now() - 60_000);
    const posts = [
      { id: "1", status: "SCHEDULED", publishAt: past, publishedAt: null },
      { id: "2", status: "DRAFT", publishAt: past, publishedAt: null },
    ];
    const result = await blogPublishJob({ maintenance: fakeMaintenance({ posts }) });
    assert.equal(result.published, 1);
    assert.equal(posts[0].status, "PUBLISHED");
    assert.equal(posts[1].status, "DRAFT"); // untouched
  });

  test("leaves posts scheduled for the future alone", async () => {
    const future = new Date(Date.now() + 60_000);
    const posts = [{ id: "1", status: "SCHEDULED", publishAt: future, publishedAt: null }];
    const result = await blogPublishJob({ maintenance: fakeMaintenance({ posts }) });
    assert.equal(result.published, 0);
    assert.equal(posts[0].status, "SCHEDULED");
  });

  test("idempotent: a second run publishes nothing further", async () => {
    const past = new Date(Date.now() - 60_000);
    const client = { maintenance: fakeMaintenance({ posts: [{ id: "1", status: "SCHEDULED", publishAt: past, publishedAt: null }] }) };
    const first = await blogPublishJob(client);
    const second = await blogPublishJob(client);
    assert.equal(first.published, 1);
    assert.equal(second.published, 0);
  });

  test("db failure is caught and reported, not thrown", async () => {
    const maintenance = { ...fakeMaintenance({}), publishDuePosts: async () => { throw new Error("db down"); } };
    const result = await blogPublishJob({ maintenance });
    assert.equal(result.published, 0);
    assert.ok(result.error);
  });
});

describe("sessionCleanupJob", () => {
  test("deletes sessions expired past the grace period", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const recent = new Date(Date.now() - 60_000); // expired, but inside the grace window
    const sessions = [
      { expiresAt: longAgo, revokedAt: null },
      { expiresAt: recent, revokedAt: null },
    ];
    const result = await sessionCleanupJob({ maintenance: fakeMaintenance({ sessions }) });
    assert.equal(result.deleted, 1);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].expiresAt.getTime(), recent.getTime());
  });

  test("deletes sessions revoked past the grace period even if not yet expired", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const sessions = [{ expiresAt: future, revokedAt: longAgo }];
    const result = await sessionCleanupJob({ maintenance: fakeMaintenance({ sessions }) });
    assert.equal(result.deleted, 1);
    assert.equal(sessions.length, 0);
  });

  test("deletes expired tokens and mfa challenges past the grace period, and sums counts", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const tokens = [{ expiresAt: longAgo }];
    const mfa = [{ expiresAt: longAgo }, { expiresAt: longAgo }];
    const result = await sessionCleanupJob({ maintenance: fakeMaintenance({ tokens, mfa }) });
    assert.equal(result.deleted, 3);
    assert.equal(tokens.length, 0);
    assert.equal(mfa.length, 0);
  });

  test("idempotent: a second run deletes nothing further", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const client = { maintenance: fakeMaintenance({ sessions: [{ expiresAt: longAgo, revokedAt: null }] }) };
    const first = await sessionCleanupJob(client);
    const second = await sessionCleanupJob(client);
    assert.equal(first.deleted, 1);
    assert.equal(second.deleted, 0);
  });
});

describe("auditPruneJob", () => {
  function fakeClient(rows: AuditLogRow[]) {
    const created: AuditRow[] = [];
    const audit = {
      async create(row: AuditRow) {
        created.push(row);
      },
      createMany: unused,
      page: unused,
      actionNames: unused,
    };
    return { client: { maintenance: fakeMaintenance({ audit: rows }), audit }, created };
  }

  test("deletes rows older than the retention period and audits the prune", async () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const rows = [{ createdAt: old }, { createdAt: recent }];
    const { client, created } = fakeClient(rows);
    const result = await auditPruneJob({ retentionDays: 365 }, client);
    assert.equal(result.deleted, 1);
    assert.equal(rows.length, 1);
    assert.equal(created.length, 1);
    assert.equal(created[0].action, "audit.exported");
  });

  test("deletes a backlog larger than one batch", async () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const rows = Array.from({ length: AUDIT_PRUNE_BATCH * 2 + 5 }, () => ({ createdAt: old }));
    const { client } = fakeClient(rows);
    const result = await auditPruneJob({ retentionDays: 365 }, client);
    assert.equal(result.deleted, AUDIT_PRUNE_BATCH * 2 + 5);
    assert.equal(rows.length, 0);
  });

  test("nothing to delete: no rows and no audit write", async () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const { client, created } = fakeClient([{ createdAt: recent }]);
    const result = await auditPruneJob({ retentionDays: 365 }, client);
    assert.equal(result.deleted, 0);
    assert.equal(created.length, 0);
  });

  test("respects a custom retention period", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const { client } = fakeClient([{ createdAt: tenDaysAgo }]);
    const result = await auditPruneJob({ retentionDays: 5 }, client);
    assert.equal(result.deleted, 1);
  });
});

describe("revisionPruneJob", () => {
  test("prunes to the kept count and reports the rows deleted", async () => {
    const kept: number[] = [];
    const maintenance = { ...fakeMaintenance({}), pruneRevisions: async (keep: number) => (kept.push(keep), 7) };
    const result = await revisionPruneJob({ maintenance });
    assert.equal(result.deleted, 7);
    assert.equal(kept.length, 1);
    assert.equal(typeof kept[0], "number");
  });

  test("db failure is caught and reported, not thrown", async () => {
    const maintenance = { ...fakeMaintenance({}), pruneRevisions: async () => { throw new Error("db down"); } };
    const result = await revisionPruneJob({ maintenance });
    assert.equal(result.deleted, 0);
    assert.ok(result.error);
  });
});
