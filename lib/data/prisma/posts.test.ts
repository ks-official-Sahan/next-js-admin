import assert from "node:assert/strict";
import { test } from "node:test";

import { UniqueViolation } from "../errors";
import { postRepo, PUBLISHED_WHERE } from "./posts";

test("the published-posts query filters on status alone, never on publishAt", () => {
  // Scheduled visibility (design notes, Step 12): a SCHEDULED
  // post's publishAt reaching "now" must never by itself make the public
  // loader show it. Only lib/cron/jobs.ts's blogPublishJob (or a manual
  // publish) flipping the row's status does that.
  assert.deepEqual(PUBLISHED_WHERE, { status: "PUBLISHED" });
  assert.ok(!("publishAt" in PUBLISHED_WHERE));
});

test("listPublished passes exactly PUBLISHED_WHERE to the client", async () => {
  let capturedWhere: unknown;
  const client = {
    post: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
    },
  };
  await postRepo(client as never).listPublished();
  assert.deepEqual(capturedWhere, { status: "PUBLISHED" });
});

test("a SCHEDULED row with publishAt in the past stays out of listPublished", async () => {
  const rows = [
    { id: "1", status: "PUBLISHED", publishAt: null },
    { id: "2", status: "SCHEDULED", publishAt: new Date(Date.now() - 60 * 60 * 1000) },
  ];
  const client = {
    post: { findMany: async (args: { where: { status: string } }) => rows.filter((row) => row.status === args.where.status) },
  };
  const result = await postRepo(client as never).listPublished();
  assert.deepEqual(
    result.map((row) => row.id),
    ["1"]
  );
});

test("updateIfUnchanged answers null when the row changed since it was read", async () => {
  const client = { post: { update: async () => Promise.reject(Object.assign(new Error("not found"), { code: "P2025" })) } };
  assert.equal(await postRepo(client as never).updateIfUnchanged("p1", new Date(), { title: "x" }), null);
});

test("updateIfUnchanged turns a taken slug into UniqueViolation", async () => {
  const client = { post: { update: async () => Promise.reject(Object.assign(new Error("unique"), { code: "P2002" })) } };
  await assert.rejects(postRepo(client as never).updateIfUnchanged("p1", new Date(), { slug: "taken" }), UniqueViolation);
});
