import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { draftStorageKey, isDraftNewer } from "./draft";

describe("draftStorageKey", () => {
  it("scopes the key to the post id", () => {
    assert.equal(draftStorageKey("abc123"), "admin:blog-draft:abc123");
  });
  it("uses \"new\" when there is no post id yet", () => {
    assert.equal(draftStorageKey(undefined), "admin:blog-draft:new");
  });
});

describe("isDraftNewer", () => {
  it("offers a draft saved after the server copy", () => {
    assert.equal(isDraftNewer("2026-05-05T10:00:00.000Z", "2026-05-05T09:00:00.000Z"), true);
  });
  it("does not offer a draft saved before the server copy", () => {
    assert.equal(isDraftNewer("2026-05-05T08:00:00.000Z", "2026-05-05T09:00:00.000Z"), false);
  });
  it("does not offer a draft saved at the same instant as the server copy", () => {
    assert.equal(isDraftNewer("2026-05-05T09:00:00.000Z", "2026-05-05T09:00:00.000Z"), false);
  });
  it("always offers a draft when there is no server copy (a new post)", () => {
    assert.equal(isDraftNewer("2026-05-05T09:00:00.000Z", null), true);
  });
  it("never offers a draft whose own timestamp is unparsable", () => {
    assert.equal(isDraftNewer("not a date", "2026-05-05T09:00:00.000Z"), false);
  });
  it("errs toward offering when the server timestamp is unparsable", () => {
    assert.equal(isDraftNewer("2026-05-05T09:00:00.000Z", "not a date"), true);
  });
});
