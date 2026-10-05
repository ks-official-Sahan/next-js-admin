#!/usr/bin/env node
// @ts-check
// Applies a variant to a template checkout in place, the same way create-admin
// does after downloading. Used by the template's CI matrix:
//   node cli/apply-variants.mjs --auth better-auth --orm drizzle [dir]
import { parseArgs } from "./lib/args.mjs";
import { applyVariants, AUTH_VALUES, ORM_VALUES } from "./lib/variants.mjs";

const args = parseArgs(process.argv.slice(2), { defaultRef: "", defaultPm: "pnpm" });
const choice = { auth: args.auth ?? AUTH_VALUES[0], orm: args.orm ?? ORM_VALUES[0] };
await applyVariants(args.dir ?? ".", choice);
console.log(`Applied --auth ${choice.auth} --orm ${choice.orm}`);
