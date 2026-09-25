import assert from "node:assert/strict";
import { test } from "node:test";

import { adminPostListSearch, parseAdminPostListParams } from "@/lib/blog/admin-list-params";
import { parseChatSessionListParams } from "@/lib/chatbot/session-summaries";

import { ADMIN_QUERY_DEFAULTS, AdminFetchError, queryKeys } from "./query-keys";

const params = (entries: Record<string, string>) => new URLSearchParams(entries);

test("every list key starts with its `all` key, so one invalidation reaches every page", () => {
  const posts = queryKeys.admin.blogPosts;
  const list = posts.list({ page: 3, q: "next", status: "DRAFT" });
  assert.deepEqual(list.slice(0, posts.all.length), [...posts.all]);

  const sessions = queryKeys.admin.chatbotSessions;
  const page = sessions.list({ limit: 50, offset: 0 });
  assert.deepEqual(page.slice(0, sessions.all.length), [...sessions.all]);
});

test("queries retry server and network failures, never 4xx; mutations never retry", () => {
  const retry = ADMIN_QUERY_DEFAULTS.queries.retry;
  assert.equal(retry(0, new AdminFetchError(404)), false);
  assert.equal(retry(0, new AdminFetchError(400)), false);
  assert.equal(retry(0, new AdminFetchError(503)), true);
  assert.equal(retry(0, new TypeError("Failed to fetch")), true);
  assert.equal(retry(2, new AdminFetchError(503)), false);
  assert.equal(ADMIN_QUERY_DEFAULTS.mutations.retry, false);
});

test("admin post list params fall back to defaults instead of failing", () => {
  assert.deepEqual(parseAdminPostListParams(params({})), { page: 1, q: "", status: "all" });
  assert.deepEqual(parseAdminPostListParams(params({ page: "-4", status: "BOGUS", q: "  hi  " })), {
    page: 1,
    q: "hi",
    status: "all",
  });
  assert.equal(parseAdminPostListParams(params({ page: "2.5" })).page, 1);
  assert.equal(parseAdminPostListParams(params({ q: "x".repeat(101) })).q, "");
});

test("the list URL leaves defaults out and round-trips through the parser", () => {
  assert.equal(adminPostListSearch({ page: 1, q: "", status: "all" }), "");
  const value = { page: 4, q: "rsc cache", status: "PUBLISHED" as const };
  assert.deepEqual(parseAdminPostListParams(new URLSearchParams(adminPostListSearch(value))), value);
});

test("chat session list params are clamped to a safe window", () => {
  assert.deepEqual(parseChatSessionListParams(params({})), { limit: 50, offset: 0 });
  assert.deepEqual(parseChatSessionListParams(params({ limit: "100000", offset: "-3" })), { limit: 100, offset: 0 });
  assert.deepEqual(parseChatSessionListParams(params({ limit: "0", offset: "50" })), { limit: 1, offset: 50 });
});
