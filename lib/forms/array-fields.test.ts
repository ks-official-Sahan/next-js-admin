import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeJsonFields, parseJsonArray, parseJsonObject, toJsonField } from "./array-fields";

test("parseJsonArray decodes a valid JSON array", () => {
  assert.deepEqual(parseJsonArray('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseJsonArray('[{"kind":"website","url":"https://x.test"}]'), [
    { kind: "website", url: "https://x.test" },
  ]);
});

test("parseJsonArray falls back for empty, missing, malformed or non-array input", () => {
  assert.deepEqual(parseJsonArray(null), []);
  assert.deepEqual(parseJsonArray(undefined), []);
  assert.deepEqual(parseJsonArray(""), []);
  assert.deepEqual(parseJsonArray("   "), []);
  assert.deepEqual(parseJsonArray("not json"), []);
  assert.deepEqual(parseJsonArray('{"a":1}'), []);
  assert.deepEqual(parseJsonArray(null, ["default"]), ["default"]);
});

test("parseJsonObject decodes a plain object and rejects arrays/scalars/malformed input", () => {
  assert.deepEqual(parseJsonObject('{"src":"/a.png","alt":"A"}'), { src: "/a.png", alt: "A" });
  assert.equal(parseJsonObject(null), null);
  assert.equal(parseJsonObject(""), null);
  assert.equal(parseJsonObject("[1,2]"), null);
  assert.equal(parseJsonObject("null"), null);
  assert.equal(parseJsonObject("5"), null);
  assert.equal(parseJsonObject("{not json"), null);
});

test("toJsonField round-trips through parseJsonArray/parseJsonObject", () => {
  const list = [{ kind: "website", url: "https://x.test", label: "Site" }];
  assert.deepEqual(parseJsonArray(toJsonField(list)), list);

  const image = { src: "/a.png", alt: "A" };
  assert.deepEqual(parseJsonObject(toJsonField(image)), image);
});

test("decodeJsonFields decodes only the listed non-empty string keys, in place", () => {
  const payload: Record<string, unknown> = {
    tech: '["react","next"]',
    platforms: "",
    title: "Hello",
  };
  const result = decodeJsonFields(payload, ["tech", "platforms", "links"]);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(payload.tech, ["react", "next"]);
  assert.equal(payload.platforms, ""); // empty string left untouched
  assert.equal(payload.links, undefined); // absent key left untouched
  assert.equal(payload.title, "Hello"); // untouched key left alone
});

test("decodeJsonFields reports the first malformed key and stops", () => {
  const payload: Record<string, unknown> = { tech: "not json", links: "[]" };
  const result = decodeJsonFields(payload, ["tech", "links"]);
  assert.deepEqual(result, { ok: false, error: "Invalid JSON in tech." });
});
