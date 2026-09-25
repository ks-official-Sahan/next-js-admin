import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { auditPruneJob, blogPublishJob, revisionPruneJob, sessionCleanupJob, CLEANUP_GRACE_MS } from "./jobs";

// Fakes stand in for Prisma. Each mimics only the subset of behaviour the job
// touches (status/date filtering), which is enough to prove the job logic
// (cutoffs, idempotency, counts) without a real database.

describe("blogPublishJob", () => {
  function fakeDb(posts: Array<{ id: string; slug: string; status: string; publishAt: Date | null; publishedAt: Date | null }>) {
    return {
      post: {
        async updateMany({ where, data }: any) {
          let count = 0;
          for (const p of posts) {
            if (p.status === where.status && p.publishAt && p.publishAt.getTime() <= where.publishAt.lte.getTime()) {
              p.status = data.status;
              p.publishedAt = data.publishedAt;
              count++;
            }
          }
          return { count };
        },
      },
    };
  }

  test("publishes scheduled posts whose time has come", async () => {
    const past = new Date(Date.now() - 60_000);
    const posts = [
      { id: "1", slug: "a", status: "SCHEDULED", publishAt: past, publishedAt: null },
      { id: "2", slug: "b", status: "DRAFT", publishAt: past, publishedAt: null },
    ];
    const db = fakeDb(posts);
    const result = await blogPublishJob(db as never);
    assert.equal(result.published, 1);
    assert.equal(posts[0].status, "PUBLISHED");
    assert.equal(posts[1].status, "DRAFT"); // untouched
  });

  test("leaves posts scheduled for the future alone", async () => {
    const future = new Date(Date.now() + 60_000);
    const posts = [{ id: "1", slug: "a", status: "SCHEDULED", publishAt: future, publishedAt: null }];
    const db = fakeDb(posts);
    const result = await blogPublishJob(db as never);
    assert.equal(result.published, 0);
    assert.equal(posts[0].status, "SCHEDULED");
  });

  test("idempotent: a second run publishes nothing further", async () => {
    const past = new Date(Date.now() - 60_000);
    const posts = [{ id: "1", slug: "a", status: "SCHEDULED", publishAt: past, publishedAt: null }];
    const db = fakeDb(posts);
    const first = await blogPublishJob(db as never);
    const second = await blogPublishJob(db as never);
    assert.equal(first.published, 1);
    assert.equal(second.published, 0);
  });

  test("db failure is caught and reported, not thrown", async () => {
    const db = { post: { updateMany: async () => { throw new Error("db down"); } } };
    const result = await blogPublishJob(db as never);
    assert.equal(result.published, 0);
    assert.ok(result.error);
  });
});

describe("sessionCleanupJob", () => {
  function fakeDb(opts: {
    sessions?: Array<{ expiresAt: Date; revokedAt: Date | null }>;
    tokens?: Array<{ expiresAt: Date }>;
    mfa?: Array<{ expiresAt: Date }>;
  }) {
    const sessions = opts.sessions ?? [];
    const tokens = opts.tokens ?? [];
    const mfa = opts.mfa ?? [];
    return {
      userSession: {
        async deleteMany({ where }: any) {
          const cutoff: Date = where.OR[0].expiresAt.lte;
          const before = sessions.length;
          const kept = sessions.filter((s) => !(s.expiresAt.getTime() <= cutoff.getTime() || (s.revokedAt && s.revokedAt.getTime() <= cutoff.getTime())));
          const count = before - kept.length;
          sessions.length = 0;
          sessions.push(...kept);
          return { count };
        },
      },
      authToken: {
        async deleteMany({ where }: any) {
          const cutoff: Date = where.expiresAt.lte;
          const before = tokens.length;
          const kept = tokens.filter((t) => t.expiresAt.getTime() > cutoff.getTime());
          const count = before - kept.length;
          tokens.length = 0;
          tokens.push(...kept);
          return { count };
        },
      },
      mfaChallenge: {
        async deleteMany({ where }: any) {
          const cutoff: Date = where.expiresAt.lte;
          const before = mfa.length;
          const kept = mfa.filter((m) => m.expiresAt.getTime() > cutoff.getTime());
          const count = before - kept.length;
          mfa.length = 0;
          mfa.push(...kept);
          return { count };
        },
      },
    };
  }

  test("deletes sessions expired past the grace period", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const recent = new Date(Date.now() - 60_000); // expired, but inside the grace window
    const sessions = [
      { expiresAt: longAgo, revokedAt: null },
      { expiresAt: recent, revokedAt: null },
    ];
    const db = fakeDb({ sessions });
    const result = await sessionCleanupJob(db as never);
    assert.equal(result.deleted, 1);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].expiresAt.getTime(), recent.getTime());
  });

  test("deletes sessions revoked past the grace period even if not yet expired", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const sessions = [{ expiresAt: future, revokedAt: longAgo }];
    const db = fakeDb({ sessions });
    const result = await sessionCleanupJob(db as never);
    assert.equal(result.deleted, 1);
    assert.equal(sessions.length, 0);
  });

  test("deletes expired tokens and mfa challenges past the grace period, and sums counts", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const tokens = [{ expiresAt: longAgo }];
    const mfa = [{ expiresAt: longAgo }, { expiresAt: longAgo }];
    const db = fakeDb({ tokens, mfa });
    const result = await sessionCleanupJob(db as never);
    assert.equal(result.deleted, 3);
    assert.equal(tokens.length, 0);
    assert.equal(mfa.length, 0);
  });

  test("idempotent: a second run deletes nothing further", async () => {
    const longAgo = new Date(Date.now() - CLEANUP_GRACE_MS - 60_000);
    const sessions = [{ expiresAt: longAgo, revokedAt: null }];
    const db = fakeDb({ sessions });
    const first = await sessionCleanupJob(db as never);
    const second = await sessionCleanupJob(db as never);
    assert.equal(first.deleted, 1);
    assert.equal(second.deleted, 0);
  });
});

describe("auditPruneJob", () => {
  function fakeDb(rows: Array<{ createdAt: Date }>) {
    const created: unknown[] = [];
    return {
      db: {
        auditLog: {
          async deleteMany({ where }: any) {
            const cutoff: Date = where.createdAt.lt;
            const before = rows.length;
            const kept = rows.filter((r) => r.createdAt.getTime() >= cutoff.getTime());
            const count = before - kept.length;
            rows.length = 0;
            rows.push(...kept);
            return { count };
          },
          async create(args: any) {
            created.push(args.data);
            return args.data;
          },
        },
      },
      created,
    };
  }

  test("deletes rows older than the retention period and audits the prune", async () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const rows = [{ createdAt: old }, { createdAt: recent }];
    const { db, created } = fakeDb(rows);
    const result = await auditPruneJob({ retentionDays: 365 }, db as never);
    assert.equal(result.deleted, 1);
    assert.equal(rows.length, 1);
    assert.equal(created.length, 1);
    assert.equal((created[0] as { action: string }).action, "audit.exported");
  });

  test("nothing to delete: no rows and no audit write", async () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const rows = [{ createdAt: recent }];
    const { db, created } = fakeDb(rows);
    const result = await auditPruneJob({ retentionDays: 365 }, db as never);
    assert.equal(result.deleted, 0);
    assert.equal(created.length, 0);
  });

  test("respects a custom retention period", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const rows = [{ createdAt: tenDaysAgo }];
    const { db } = fakeDb(rows);
    const result = await auditPruneJob({ retentionDays: 5 }, db as never);
    assert.equal(result.deleted, 1);
  });
});

describe("revisionPruneJob", () => {
  test("runs one statement capped at the kept count and reports the rows deleted", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        calls.push({ sql: strings.join("?"), values });
        return 7;
      },
    };
    const result = await revisionPruneJob(db as never);
    assert.equal(result.deleted, 7);
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /row_number\(\) OVER \(PARTITION BY "postId" ORDER BY "createdAt" DESC\)/);
    assert.equal(typeof calls[0].values[0], "number");
  });

  test("db failure is caught and reported, not thrown", async () => {
    const db = { $executeRaw: async () => { throw new Error("db down"); } };
    const result = await revisionPruneJob(db as never);
    assert.equal(result.deleted, 0);
    assert.ok(result.error);
  });
});
