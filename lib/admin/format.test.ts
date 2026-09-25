import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDateTime, relativeTime } from "./format";

describe("formatDateTime", () => {
  it("prints UTC", () => assert.equal(formatDateTime(new Date("2026-09-21T14:05:00Z")), "21 Sep 2026, 14:05 UTC"));
  it("handles missing and bad values", () => {
    assert.equal(formatDateTime(null), "Never");
    assert.equal(formatDateTime("nope"), "Unknown");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms);
  it("steps through the units", () => {
    assert.equal(relativeTime(ago(10_000), now), "just now");
    assert.equal(relativeTime(ago(60_000), now), "1 minute ago");
    assert.equal(relativeTime(ago(5 * 60_000), now), "5 minutes ago");
    assert.equal(relativeTime(ago(3 * 3600_000), now), "3 hours ago");
    assert.equal(relativeTime(ago(3 * 86400_000), now), "3 days ago");
    assert.equal(relativeTime(ago(30 * 86400_000), now), "22 Aug 2026, 12:00 UTC");
  });
  it("says Never for null", () => assert.equal(relativeTime(null, now), "Never"));
});
