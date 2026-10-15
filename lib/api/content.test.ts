import assert from "node:assert/strict";
import { test } from "node:test";

import { contentResponse, rejectUnknownParams } from "./content";

const url = "https://example.test/api/content/v1/posts";

test("contentResponse sends the envelope with a strong ETag", async () => {
  const response = contentResponse(new Request(url), { a: 1 }, []);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("etag") ?? "", /^"[\w-]{32}"$/);
  assert.deepEqual(await response.json(), { apiVersion: 1, data: { a: 1 } });
});

test("contentResponse answers 304 with no body when If-None-Match names the ETag", async () => {
  const etag = contentResponse(new Request(url), { a: 1 }, []).headers.get("etag") ?? "";
  for (const header of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
    const response = contentResponse(new Request(url, { headers: { "If-None-Match": header } }), { a: 1 }, []);
    assert.equal(response.status, 304, header);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("etag"), etag);
  }
});

test("contentResponse sends a new body when the data changed", () => {
  const etag = contentResponse(new Request(url), { a: 1 }, []).headers.get("etag") ?? "";
  const response = contentResponse(new Request(url, { headers: { "If-None-Match": etag } }), { a: 2 }, []);
  assert.equal(response.status, 200);
  assert.notEqual(response.headers.get("etag"), etag);
});

test("contentResponse tags the response for CDN purges, each tag once", () => {
  const tagged = contentResponse(new Request(url), { a: 1 }, ["blog:list", "cms", "blog:list"]);
  assert.equal(tagged.headers.get("vercel-cache-tag"), "blog:list,cms");
  assert.equal(contentResponse(new Request(url), { a: 1 }, []).headers.get("vercel-cache-tag"), null);
});

test("rejectUnknownParams allows only the listed parameters", () => {
  assert.equal(rejectUnknownParams(new Request(`${url}?limit=5&cursor=abc`), ["limit", "cursor"]), null);
  assert.equal(rejectUnknownParams(new Request(url)), null);
  assert.equal(rejectUnknownParams(new Request(`${url}?limit=5&x=1`), ["limit", "cursor"])?.status, 400);
  assert.equal(rejectUnknownParams(new Request(`${url}?x=1`))?.status, 400);
});
