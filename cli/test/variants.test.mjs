import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { applyVariants, editPackageJson, removeEnvVars } from "../lib/variants.mjs";

async function fixture(manifest) {
  const dir = await mkdtemp(path.join(tmpdir(), "create-admin-variants-"));
  const put = async (rel, content) => {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), content);
  };
  await put("variants/variants.json", JSON.stringify(manifest));
  await put("package.json", JSON.stringify({ dependencies: { b: "1", "next-auth": "5" }, scripts: { "db:push": "prisma db push" } }));
  await put(".env.example", "AUTH_SECRET=\nAUTH_TRUST_HOST=true\n# AUTH_DEBUG=\nDATABASE_URL=\n");
  await put("lib/auth/config.ts", "next-auth");
  await put("lib/data/index.ts", "prisma");
  await put("lib/data/drizzle/a.ts", "drizzle");
  await put("app/api/auth/[...nextauth]/route.ts", "404");
  await put("variants/auth/better-auth/lib/auth/config.ts", "better-auth");
  await put("variants/orm/drizzle/lib/data/index.ts", "drizzle");
  await put("variants/combos/better-auth+drizzle/lib/data/better-auth.ts", "combo");
  return { dir, read: (rel) => readFile(path.join(dir, rel), "utf8"), has: (rel) => existsSync(path.join(dir, rel)) };
}

const MANIFEST = {
  auth: {
    "next-auth": {},
    "better-auth": {
      overlay: "variants/auth/better-auth",
      remove: ["app/api/auth/[...nextauth]"],
      dependencies: { "better-auth": "1", "next-auth": null },
      env: { remove: ["AUTH_TRUST_HOST", "AUTH_DEBUG"] },
    },
  },
  orm: {
    prisma: { remove: ["lib/data/drizzle"] },
    drizzle: { overlay: "variants/orm/drizzle", scripts: { "db:push": "drizzle-kit push" } },
  },
  combos: { "better-auth+drizzle": { overlay: "variants/combos/better-auth+drizzle" } },
};

test("applyVariants with the defaults only trims the other ORM", async () => {
  const f = await fixture(MANIFEST);
  try {
    await applyVariants(f.dir, { auth: "next-auth", orm: "prisma" });
    assert.equal(await f.read("lib/auth/config.ts"), "next-auth");
    assert.equal(f.has("lib/data/drizzle"), false);
    assert.equal(f.has("variants"), false);
    assert.equal(f.has("app/api/auth/[...nextauth]/route.ts"), true);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("applyVariants copies overlays and the combo, edits package.json and .env.example", async () => {
  const f = await fixture(MANIFEST);
  try {
    await applyVariants(f.dir, { auth: "better-auth", orm: "drizzle" });
    assert.equal(await f.read("lib/auth/config.ts"), "better-auth");
    assert.equal(await f.read("lib/data/index.ts"), "drizzle");
    assert.equal(await f.read("lib/data/better-auth.ts"), "combo");
    assert.equal(f.has("app/api/auth/[...nextauth]"), false);
    const pkg = JSON.parse(await f.read("package.json"));
    assert.deepEqual(Object.keys(pkg.dependencies), ["b", "better-auth"]);
    assert.equal(pkg.scripts["db:push"], "drizzle-kit push");
    assert.equal(await f.read(".env.example"), "AUTH_SECRET=\nDATABASE_URL=\n");
    assert.equal(f.has("variants"), false);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("applyVariants refuses a manifest path outside the project", async () => {
  const f = await fixture({ ...MANIFEST, orm: { prisma: { remove: ["../outside"] } } });
  try {
    await assert.rejects(applyVariants(f.dir, { auth: "next-auth", orm: "prisma" }), /leaves the project/);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("a template without variants works only with the defaults", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "create-admin-old-"));
  try {
    await applyVariants(dir, { auth: "next-auth", orm: "prisma" });
    await assert.rejects(applyVariants(dir, { auth: "better-auth", orm: "prisma" }), /needs a newer --ref/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("editPackageJson deletes on null and keeps dependencies sorted", () => {
  const pkg = editPackageJson({ dependencies: { z: "1", a: "1" }, scripts: { x: "1" } }, [
    { dependencies: { m: "2", z: null }, scripts: { x: null, y: "2" } },
  ]);
  assert.deepEqual(pkg, { dependencies: { a: "1", m: "2" }, scripts: { y: "2" } });
});

test("removeEnvVars drops set and commented lines only for the named keys", () => {
  assert.equal(removeEnvVars("A=1\n# B=\nBC=3\n", ["B"]), "A=1\nBC=3\n");
});
