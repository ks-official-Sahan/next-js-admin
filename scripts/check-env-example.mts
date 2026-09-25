#!/usr/bin/env -S node --import tsx
// Checks that .env.example lists exactly the variable names lib/env.ts's zod
// schema declares, plus the short documented list of variables that are
// intentionally read straight from process.env outside that schema (proxy.ts
// runs before any server-only import can load). Exits non-zero on a mismatch
// so it can run in CI or as a pre-commit check. Never reads or prints values.
//
// Run: pnpm exec tsx scripts/check-env-example.mts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Variables read directly from process.env, never through lib/env.ts's typed
// schema, because the code that reads them runs somewhere lib/env.ts's
// `server-only` import cannot load (proxy.ts, which must stay edge/runtime
// agnostic and cannot pull in the database-adjacent parts of the app).
const OUTSIDE_SCHEMA = new Set(["TRUSTED_PROXY_HOPS", "NODE_ENV"]);

function namesFromEnvTs(): Set<string> {
  const source = readFileSync(`${root}lib/env.ts`, "utf8");
  const schemaMatch = source.match(/const schema = z\.object\(\{([\s\S]*?)\n\}\);/);
  if (!schemaMatch) throw new Error("Could not find `const schema = z.object({...})` in lib/env.ts");
  const body = schemaMatch[1];
  const names = new Set<string>();
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]*):/);
    if (match) names.add(match[1]);
  }
  return names;
}

function namesFromEnvExample(): Set<string> {
  const source = readFileSync(`${root}.env.example`, "utf8");
  const names = new Set<string>();
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Both live and commented-out ("# NAME=") entries count as "listed".
    const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
    if (match) names.add(match[1]);
  }
  return names;
}

const schemaNames = namesFromEnvTs();
const exampleNames = namesFromEnvExample();

const missingFromExample = [...schemaNames].filter((name) => !exampleNames.has(name)).sort();
const extraInExample = [...exampleNames]
  .filter((name) => !schemaNames.has(name) && !OUTSIDE_SCHEMA.has(name))
  .sort();

let ok = true;

if (missingFromExample.length > 0) {
  ok = false;
  console.error("In lib/env.ts's schema but missing from .env.example:");
  for (const name of missingFromExample) console.error(`  - ${name}`);
}

if (extraInExample.length > 0) {
  ok = false;
  console.error(".env.example lists a name lib/env.ts's schema does not declare:");
  for (const name of extraInExample) console.error(`  - ${name}`);
  console.error("(Add it to lib/env.ts's schema, or to OUTSIDE_SCHEMA in this script if it's read directly.)");
}

if (ok) {
  console.log(`OK: .env.example matches lib/env.ts's schema (${schemaNames.size} variables, plus ${OUTSIDE_SCHEMA.size} read outside it).`);
  process.exit(0);
} else {
  process.exit(1);
}
