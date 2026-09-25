import assert from "node:assert/strict";
import { test } from "node:test";

import { HEARTBEAT_MS, heartbeatDecision, nextDelay, shouldPollOnFocus } from "./heartbeat";

test("an active session is ok, an inactive one is expired", () => {
  assert.equal(heartbeatDecision({ status: 200, active: true }), "ok");
  assert.equal(heartbeatDecision({ status: 200, active: false }), "expired");
  assert.equal(heartbeatDecision({ status: 200 }), "expired", "a body without active is not trusted");
  assert.equal(heartbeatDecision({ status: 200, active: "yes" }), "expired");
});

test("auth failures end the session, server trouble and network failures only retry", () => {
  for (const status of [401, 403, 404]) assert.equal(heartbeatDecision({ status }), "expired", String(status));
  for (const status of [429, 500, 502, 503, 504]) assert.equal(heartbeatDecision({ status }), "retry", String(status));
  assert.equal(heartbeatDecision(null), "retry");
});

test("the delay is 30 seconds, backing off up to five minutes while retrying", () => {
  assert.equal(nextDelay("ok", 0), HEARTBEAT_MS);
  assert.equal(nextDelay("expired", 3), HEARTBEAT_MS);
  assert.equal(nextDelay("retry", 0), 30_000);
  assert.equal(nextDelay("retry", 1), 60_000);
  assert.equal(nextDelay("retry", 2), 120_000);
  assert.equal(nextDelay("retry", 10), 300_000);
});

test("a tab that regains focus polls at once only when the last check is old", () => {
  assert.equal(shouldPollOnFocus(100_000, null), true);
  assert.equal(shouldPollOnFocus(100_000, 100_000 - HEARTBEAT_MS + 1), false);
  assert.equal(shouldPollOnFocus(100_000, 100_000 - HEARTBEAT_MS), true);
});
