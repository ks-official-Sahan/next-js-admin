import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../lib/args.mjs";

const defaults = { defaultRef: "v0.1.0", defaultPm: "pnpm" };

test("parseArgs applies defaults with no arguments", () => {
  const result = parseArgs([], defaults);
  assert.deepEqual(result, {
    dir: undefined,
    ref: "v0.1.0",
    install: true,
    git: true,
    pm: "pnpm",
    auth: undefined,
    orm: undefined,
    help: false,
    version: false,
  });
});

test("parseArgs reads --auth and --orm and validates them", () => {
  const result = parseArgs(["--auth", "better-auth", "--orm", "drizzle"], defaults);
  assert.equal(result.auth, "better-auth");
  assert.equal(result.orm, "drizzle");
  assert.throws(() => parseArgs(["--auth", "lucia"], defaults), /--auth must be one of/);
  assert.throws(() => parseArgs(["--orm"], defaults), /--orm must be one of/);
});

test("parseArgs reads the positional directory argument", () => {
  const result = parseArgs(["my-app"], defaults);
  assert.equal(result.dir, "my-app");
});

test("parseArgs reads --ref", () => {
  const result = parseArgs(["my-app", "--ref", "v0.2.0"], defaults);
  assert.equal(result.ref, "v0.2.0");
});

test("parseArgs reads --pm and validates it", () => {
  assert.equal(parseArgs(["--pm", "npm"], defaults).pm, "npm");
  assert.equal(parseArgs(["--pm", "yarn"], defaults).pm, "yarn");
  assert.equal(parseArgs(["--pm", "bun"], defaults).pm, "bun");
  assert.throws(() => parseArgs(["--pm", "nope"], defaults), /Invalid --pm value/);
});

test("parseArgs reads --no-install and --no-git", () => {
  const result = parseArgs(["--no-install", "--no-git"], defaults);
  assert.equal(result.install, false);
  assert.equal(result.git, false);
});

test("parseArgs reads --help and --version, short and long forms", () => {
  assert.equal(parseArgs(["--help"], defaults).help, true);
  assert.equal(parseArgs(["-h"], defaults).help, true);
  assert.equal(parseArgs(["--version"], defaults).version, true);
  assert.equal(parseArgs(["-v"], defaults).version, true);
});

test("parseArgs throws on an unknown flag", () => {
  assert.throws(() => parseArgs(["--bogus"], defaults), /Unknown option: --bogus/);
});

test("parseArgs throws when --ref or --pm is missing its value", () => {
  assert.throws(() => parseArgs(["--ref"], defaults), /--ref requires a value/);
  assert.throws(() => parseArgs(["--pm"], defaults), /--pm requires a value/);
});

test("parseArgs throws on more than one positional argument", () => {
  assert.throws(() => parseArgs(["dir1", "dir2"], defaults), /Unexpected extra argument/);
});

test("parseArgs combines flags and a positional in any order", () => {
  const result = parseArgs(["--no-git", "my-app", "--pm", "yarn", "--no-install"], defaults);
  assert.equal(result.dir, "my-app");
  assert.equal(result.pm, "yarn");
  assert.equal(result.git, false);
  assert.equal(result.install, false);
});
