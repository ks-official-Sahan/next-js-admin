import assert from "node:assert/strict";
import { test } from "node:test";

import { assertProductionEnv, envProblems, shouldEnforce, splitList, warnDevEnv } from "./env-rules";

const long = (length: number) => "x".repeat(length);

const GOOD = {
  AUTH_SECRET: long(40),
  INTERNAL_SIGNING_SECRET: long(32),
  ADMIN_LOGIN_UNLOCK_SECRET: long(12),
};

test("envProblems accepts long enough secrets", () => {
  assert.deepEqual(envProblems(GOOD), []);
});

test("required secrets that are missing or blank are reported", () => {
  const names = envProblems({ AUTH_SECRET: "   " }).map((problem) => `${problem.name}:${problem.kind}`);
  assert.deepEqual(names.sort(), [
    "ADMIN_LOGIN_UNLOCK_SECRET:missing",
    "AUTH_SECRET:missing",
    "INTERNAL_SIGNING_SECRET:missing",
  ]);
});

test("optional secrets are only checked when present", () => {
  assert.deepEqual(envProblems(GOOD), []);
  const problems = envProblems({
    ...GOOD,
    MEDIA_SIGNING_SECRET: long(10),
    MAINTENANCE_BYPASS_SECRET: long(8),
    CRON_SECRET: long(31),
  });
  assert.deepEqual(
    problems.map((problem) => problem.name).sort(),
    ["CRON_SECRET", "MAINTENANCE_BYPASS_SECRET", "MEDIA_SIGNING_SECRET"]
  );
  assert.ok(problems.every((problem) => problem.kind === "too-short"));
});

test("length boundaries are inclusive", () => {
  assert.deepEqual(envProblems({ ...GOOD, AUTH_SECRET: long(32) }), []);
  assert.equal(envProblems({ ...GOOD, AUTH_SECRET: long(31) }).length, 1);
  assert.deepEqual(envProblems({ ...GOOD, ADMIN_LOGIN_UNLOCK_SECRET: long(12) }), []);
  assert.equal(envProblems({ ...GOOD, ADMIN_LOGIN_UNLOCK_SECRET: long(11) }).length, 1);
});

test("the capture mail provider is forbidden in production", () => {
  const problems = envProblems({ ...GOOD, EMAIL_PROVIDER: " Capture " });
  assert.deepEqual(problems.map((problem) => `${problem.name}:${problem.kind}`), ["EMAIL_PROVIDER:forbidden"]);
});

test("shouldEnforce needs production, a running server and a database", () => {
  const base = { NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@h/db" };
  assert.equal(shouldEnforce(base), true);
  assert.equal(shouldEnforce({ ...base, NEXT_PHASE: "phase-production-build" }), false);
  assert.equal(shouldEnforce({ NODE_ENV: "production" }), false);
  assert.equal(shouldEnforce({ ...base, NODE_ENV: "development" }), false);
});

test("assertProductionEnv throws with names only and never with values", () => {
  const secret = "very-secret-value";
  const source = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@h/db",
    AUTH_SECRET: secret,
    INTERNAL_SIGNING_SECRET: long(40),
    ADMIN_LOGIN_UNLOCK_SECRET: long(20),
  };
  assert.throws(
    () => assertProductionEnv(source),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /AUTH_SECRET must be at least 32 characters/);
      assert.equal(error.message.includes(secret), false);
      return true;
    }
  );
});

test("assertProductionEnv is silent when it does not apply or all is well", () => {
  assert.doesNotThrow(() => assertProductionEnv({ NODE_ENV: "production" })); // no database
  assert.doesNotThrow(() =>
    assertProductionEnv({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
      DATABASE_URL: "postgresql://u:p@h/db",
    })
  );
  assert.doesNotThrow(() => assertProductionEnv({ NODE_ENV: "development", DATABASE_URL: "x" }));
  assert.doesNotThrow(() =>
    assertProductionEnv({ NODE_ENV: "production", DATABASE_URL: "x", ...GOOD })
  );
});

test("warnDevEnv warns about short secrets outside production only", () => {
  const messages: string[] = [];
  const weak = warnDevEnv(
    { NODE_ENV: "development", INTERNAL_SIGNING_SECRET: long(9), AUTH_SECRET: long(50) },
    (message) => messages.push(message)
  );
  assert.deepEqual(weak.map((problem) => problem.name), ["INTERNAL_SIGNING_SECRET"]);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /INTERNAL_SIGNING_SECRET must be at least 32 characters/);

  const quiet: string[] = [];
  assert.deepEqual(
    warnDevEnv({ NODE_ENV: "production", AUTH_SECRET: long(3) }, (message) => quiet.push(message)),
    []
  );
  assert.equal(quiet.length, 0);
});

test("missing secrets do not warn in development", () => {
  const messages: string[] = [];
  assert.deepEqual(warnDevEnv({ NODE_ENV: "development" }, (message) => messages.push(message)), []);
  assert.equal(messages.length, 0);
});

test("splitList trims and drops empty items", () => {
  assert.deepEqual(splitList(" a@x.com, b@x.com ,, "), ["a@x.com", "b@x.com"]);
  assert.deepEqual(splitList(""), []);
  assert.deepEqual(splitList(undefined), []);
});
