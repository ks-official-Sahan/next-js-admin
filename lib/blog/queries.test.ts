import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultPosts, getPostBySlug, PUBLISHED_WHERE, readPublishedPosts, relatedPosts, taxonomyOf } from "./queries";

test("getPostBySlug rejects a malformed slug before any read", async () => {
  // No database is configured in tests: reaching a read would throw or log.
  assert.equal(await getPostBySlug("../etc/passwd"), null);
  assert.equal(await getPostBySlug("UPPER"), null);
  assert.equal(await getPostBySlug("x".repeat(200)), null);
});

test("relatedPosts ranks by shared tags and topic, excludes the post itself, and caps the list", () => {
  const base = defaultPosts()[0];
  const make = (slug: string, topic: string, tags: string[]) => ({ ...base, slug, topic, tags });
  const post = make("self", "Release", ["next", "react"]);
  const posts = [
    post,
    make("none", "Other", ["go"]),
    make("topic-only", "Release", []),
    make("two-tags", "Other", ["next", "react"]),
    make("one-tag", "Other", ["react"]),
  ];
  assert.deepEqual(
    relatedPosts(post, posts).map((p) => p.slug),
    ["two-tags", "topic-only", "one-tag"]
  );
  assert.equal(relatedPosts(post, posts, 1).length, 1);
});

test("the published-posts query filters on status alone, never on publishAt", () => {
  // Scheduled visibility (design notes, Step 12): a SCHEDULED
  // post's publishAt reaching "now" must never by itself make the public
  // loader show it. Only lib/cron/jobs.ts's blogPublishJob (or a manual
  // publish) flipping the row's status does that.
  assert.deepEqual(PUBLISHED_WHERE, { status: "PUBLISHED" });
  assert.ok(!("publishAt" in PUBLISHED_WHERE));
});

test("readPublishedPosts passes exactly PUBLISHED_WHERE to the client, regardless of publishAt", async () => {
  let capturedWhere: unknown;
  const fakeClient = {
    findMany: async (args: { where: unknown }) => {
      capturedWhere = args.where;
      // A SCHEDULED post whose publishAt is far in the past: a query that
      // computed visibility from publishAt would have to filter it in.
      return [];
    },
  };

  await readPublishedPosts(fakeClient as never);
  assert.deepEqual(capturedWhere, { status: "PUBLISHED" });
});

test("a SCHEDULED row, even with publishAt in the past, is excluded when the fake client honors the where clause", async () => {
  const now = Date.now();
  const rows = [
    { id: "1", slug: "a", status: "PUBLISHED", publishAt: null },
    { id: "2", slug: "b", status: "SCHEDULED", publishAt: new Date(now - 1000 * 60 * 60) },
  ];
  const fakeClient = {
    findMany: async (args: { where: { status: string } }) =>
      rows.filter((row) => row.status === args.where.status),
  };

  const result = await readPublishedPosts(fakeClient as never);
  assert.equal(result.length, 1);
  assert.equal((result[0] as { id: string }).id, "1");
});

test("defaultPosts derives unique, valid slugs from UpdatesContent.posts", () => {
  const posts = defaultPosts();
  assert.ok(posts.length > 0);
  const slugs = posts.map((post) => post.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs must be unique");
  for (const post of posts) {
    assert.ok(post.contentHtml.startsWith("<p>"));
    assert.ok(post.readMinutes >= 1);
  }
});

test("taxonomyOf counts topics and tags from the given posts only", () => {
  const posts = defaultPosts();
  const { topics, tags } = taxonomyOf(posts);
  const totalFromTopics = topics.reduce((sum, t) => sum + t.count, 0);
  assert.equal(totalFromTopics, posts.length);
  for (const tag of tags) assert.ok(tag.count > 0);
});
