import assert from "node:assert/strict";
import { test } from "node:test";

import { table } from "./raw";

test("table() qualifies with the schema from DATABASE_URL", () => {
  assert.equal(table("users", { DATABASE_URL: "postgresql://u:p@h/db?schema=public_test" }).sql, '"public_test"."users"');
  assert.equal(table("media_assets", {}).sql, '"public"."media_assets"');
});

test("table() refuses anything but a plain identifier, and schemas off the allowed list", () => {
  assert.throws(() => table('users"; SELECT 1; --', {}));
  assert.throws(() => table("Users", {}));
  assert.throws(() => table("users", { DATABASE_URL: "postgresql://u:p@h/db?schema=valorem" }));
});
