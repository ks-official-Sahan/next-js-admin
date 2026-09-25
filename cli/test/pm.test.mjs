import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPackageManager, installCommand } from "../lib/pm.mjs";

test("detectPackageManager reads the leading token of npm_config_user_agent", () => {
  assert.equal(detectPackageManager("pnpm/9.1.0 npm/? node/v20.11.0 win32 x64"), "pnpm");
  assert.equal(detectPackageManager("npm/10.5.0 node/v20.11.0 win32 x64"), "npm");
  assert.equal(detectPackageManager("yarn/4.1.0 npm/? node/v20.11.0 darwin x64"), "yarn");
  assert.equal(detectPackageManager("bun/1.1.0"), "bun");
});

test("detectPackageManager falls back to pnpm for unset or unrecognized values", () => {
  assert.equal(detectPackageManager(undefined), "pnpm");
  assert.equal(detectPackageManager(""), "pnpm");
  assert.equal(detectPackageManager("deno/1.40.0"), "pnpm");
});

test("installCommand returns the right command per package manager", () => {
  assert.deepEqual(installCommand("pnpm"), { command: "pnpm", args: ["install"] });
  assert.deepEqual(installCommand("npm"), { command: "npm", args: ["install"] });
  assert.deepEqual(installCommand("yarn"), { command: "yarn", args: [] });
  assert.deepEqual(installCommand("bun"), { command: "bun", args: ["install"] });
});
