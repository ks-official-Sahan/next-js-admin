import assert from "node:assert/strict";
import { test } from "node:test";

import { maintenancePageHtml, retryAfterSeconds } from "./maintenance-page";

const now = Date.parse("2026-10-10T10:00:00.000Z");

test("the page shows the saved reason, escaped, and the expected end time", () => {
  const html = maintenancePageHtml({ reason: "Moving <servers> & DNS", estimatedEndTime: "2026-10-10T12:00:00.000Z" }, now);
  assert.ok(html.includes("Moving &lt;servers&gt; &amp; DNS"));
  assert.ok(html.includes('datetime="2026-10-10T12:00:00.000Z"'));
});

test("no reason falls back to the default text; a past end time is not shown", () => {
  const html = maintenancePageHtml({ reason: "  ", estimatedEndTime: "2026-10-10T09:00:00.000Z" }, now);
  assert.ok(html.includes("temporarily unavailable"));
  assert.ok(!html.includes("<time"));
});

test("Retry-After follows the end time, clamped to 1 minute .. 1 day, else 1 hour", () => {
  assert.equal(retryAfterSeconds({ estimatedEndTime: "2026-10-10T10:30:00.000Z" }, now), 1800);
  assert.equal(retryAfterSeconds({ estimatedEndTime: "2026-10-10T09:00:00.000Z" }, now), 60);
  assert.equal(retryAfterSeconds({ estimatedEndTime: "2026-10-20T10:00:00.000Z" }, now), 86_400);
  assert.equal(retryAfterSeconds(null, now), 3600);
});
