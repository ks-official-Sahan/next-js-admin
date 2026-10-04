import assert from "node:assert/strict";
import { test } from "node:test";

import type { DbClient } from "./client";
import { maintenanceRepo } from "./maintenance";

// The exact Prisma queries behind the cron jobs. A recording fake stands in
// for the client; the tests never touch a database.

function recorder() {
  const calls: { model: string; method: string; args: unknown }[] = [];
  const model = (name: string, result: unknown) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => async (args: unknown) => {
          calls.push({ model: name, method, args });
          return result;
        },
      }
    );
  const client = {
    post: model("post", { count: 2 }),
    userSession: model("userSession", { count: 3 }),
    authToken: model("authToken", { count: 4 }),
    mfaChallenge: model("mfaChallenge", { count: 5 }),
    auditLog: model("auditLog", [{ id: "a" }, { id: "b" }]),
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      calls.push({ model: "$executeRaw", method: strings.join("?"), args: values });
      return 7;
    },
  };
  return { calls, repo: maintenanceRepo(client as unknown as DbClient) };
}

test("publishDuePosts flips SCHEDULED posts due by now", async () => {
  const { calls, repo } = recorder();
  const now = new Date("2026-05-01T00:00:00Z");
  assert.equal(await repo.publishDuePosts(now), 2);
  assert.deepEqual(calls[0].args, {
    where: { status: "SCHEDULED", publishAt: { lte: now } },
    data: { status: "PUBLISHED", publishedAt: now },
  });
});

test("deleteEndedSessions removes expired or revoked sessions past the cutoff", async () => {
  const { calls, repo } = recorder();
  const cutoff = new Date("2026-05-01T00:00:00Z");
  assert.equal(await repo.deleteEndedSessions(cutoff), 3);
  assert.deepEqual(calls[0].args, { where: { OR: [{ expiresAt: { lte: cutoff } }, { revokedAt: { lte: cutoff } }] } });
});

test("tokens and MFA challenges go by expiry only", async () => {
  const { calls, repo } = recorder();
  const cutoff = new Date("2026-05-01T00:00:00Z");
  assert.equal(await repo.deleteExpiredAuthTokens(cutoff), 4);
  assert.equal(await repo.deleteExpiredMfaChallenges(cutoff), 5);
  assert.deepEqual(calls.map((call) => [call.model, call.args]), [
    ["authToken", { where: { expiresAt: { lte: cutoff } } }],
    ["mfaChallenge", { where: { expiresAt: { lte: cutoff } } }],
  ]);
});

test("audit pruning pages oldest first and deletes by id", async () => {
  const { calls, repo } = recorder();
  const cutoff = new Date("2026-05-01T00:00:00Z");
  assert.deepEqual(await repo.oldestAuditIdsBefore(cutoff, 100), ["a", "b"]);
  assert.deepEqual(calls[0].args, { where: { createdAt: { lt: cutoff } }, orderBy: { createdAt: "asc" }, select: { id: true }, take: 100 });
  assert.equal(await repo.deleteAuditRows([]), 0);
  assert.equal(calls.length, 1, "no query for an empty batch");
});

test("pruneRevisions is one ranked DELETE capped at the kept count", async () => {
  const { calls, repo } = recorder();
  assert.equal(await repo.pruneRevisions(20), 7);
  assert.equal(calls.length, 1);
  assert.match(calls[0].method, /row_number\(\) OVER \(PARTITION BY "postId" ORDER BY "createdAt" DESC\)/);
  assert.deepEqual(calls[0].args, [20]);
});
