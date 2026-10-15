import assert from "node:assert/strict";
import { test } from "node:test";

import { isDue, VISIBLE_AHEAD_MS, visibleAhead } from "./visibility";

test("isDue: no publishAt, or one that has passed, is public; a future one is not", () => {
  const now = Date.parse("2026-10-10T10:00:00.000Z");
  assert.equal(isDue({ publishAt: null }, now), true);
  assert.equal(isDue({ publishAt: new Date(now) }, now), true);
  assert.equal(isDue({ publishAt: new Date(now + 1) }, now), false);
  // A Redis cache hit carries dates as ISO strings.
  assert.equal(isDue({ publishAt: "2026-10-10T09:59:59.000Z" }, now), true);
  assert.equal(isDue({ publishAt: "2026-10-10T10:00:01.000Z" }, now), false);
});

test("visibleAhead looks VISIBLE_AHEAD_MS past now, beyond the 600 s a data cache plus Redis can hold", () => {
  assert.equal(visibleAhead(0).getTime(), VISIBLE_AHEAD_MS);
  assert.ok(VISIBLE_AHEAD_MS > 600_000);
});
