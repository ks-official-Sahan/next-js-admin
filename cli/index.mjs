#!/usr/bin/env node
// @ts-check

import { readFile, writeFile, rm, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";
import { downloadTemplate } from "giget";

import { parseArgs, HELP_TEXT } from "./lib/args.mjs";
import { detectPackageManager, installCommand } from "./lib/pm.mjs";
import { normalizeToNpmName } from "./lib/npm-name.mjs";
import { renderEnvLocal, listSecretVarNames } from "./lib/env-template.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The template repository this CLI scaffolds from. */
const TEMPLATE_REPO = "ks-official-Sahan/next-js-admin";

async function main() {
  const pkg = JSON.parse(await readFile(path.join(__dirname, "package.json"), "utf8"));

  let args;
  try {
    args = parseArgs(process.argv.slice(2), {
      defaultRef: `v${pkg.version}`,
      defaultPm: detectPackageManager(process.env.npm_config_user_agent),
    });
  } catch (error) {
    console.error(`create-admin: ${/** @type {Error} */ (error).message}`);
    console.error(HELP_TEXT);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }
  if (args.version) {
    console.log(pkg.version);
    return;
  }

  const dir = args.dir ?? (await askForDir());
  const targetDir = path.resolve(process.cwd(), dir);

  await refuseNonEmptyDir(targetDir);

  console.log(`\nDownloading admin-template@${args.ref}...`);
  await downloadTemplate(`github:${TEMPLATE_REPO}#${args.ref}`, {
    dir: targetDir,
    force: true,
  });

  await removeIfExists(path.join(targetDir, "cli"));
  await removeIfExists(path.join(targetDir, ".github", "workflows", "release-cli.yml"));

  const packageJsonPath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.name = normalizeToNpmName(path.basename(targetDir));
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const envExamplePath = path.join(targetDir, ".env.example");
  const envLocalPath = path.join(targetDir, ".env.local");
  let generatedSecrets = [];
  if (existsSync(envExamplePath)) {
    const envExample = await readFile(envExamplePath, "utf8");
    await writeFile(envLocalPath, renderEnvLocal(envExample), "utf8");
    generatedSecrets = listSecretVarNames(envExample);
  }

  if (args.install) {
    console.log(`\nInstalling dependencies with ${args.pm}...`);
    await run(installCommand(args.pm).command, installCommand(args.pm).args, targetDir);
  }

  if (args.git) {
    console.log("\nInitializing git repository...");
    await run("git", ["init", "-q"], targetDir);
    await run("git", ["add", "-A"], targetDir);
    await run("git", ["commit", "-q", "-m", "chore: scaffold from admin-template"], targetDir).catch(() => {
      // No git identity configured, or nothing to commit — not fatal, the
      // scaffold is still usable; the owner can commit manually.
      console.log("(skipped initial commit — configure `git config user.name/user.email` and commit yourself)");
    });
  }

  printNextSteps(targetDir, dir, args, generatedSecrets);
}

async function askForDir() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Project directory: ");
    return answer.trim() || "my-admin-app";
  } finally {
    rl.close();
  }
}

/** @param {string} targetDir */
async function refuseNonEmptyDir(targetDir) {
  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true });
    return;
  }
  const entries = await readdir(targetDir);
  if (entries.length > 0) {
    console.error(`create-admin: "${targetDir}" already exists and is not empty.`);
    process.exit(1);
  }
}

/** @param {string} target */
async function removeIfExists(target) {
  if (existsSync(target)) await rm(target, { recursive: true, force: true });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<void>}
 */
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

/**
 * @param {string} targetDir
 * @param {string} dirArg
 * @param {import("./lib/args.mjs").ParsedArgs} args
 * @param {string[]} generatedSecrets
 */
function printNextSteps(targetDir, dirArg, args, generatedSecrets) {
  const rel = path.relative(process.cwd(), targetDir) || ".";
  console.log(`\nDone. Created a new admin-template project in ${rel}\n`);
  if (generatedSecrets.length > 0) {
    console.log(`Generated random secrets for: ${generatedSecrets.join(", ")} (in .env.local).`);
  }
  console.log("\nNext steps:");
  console.log(`  cd ${rel}`);
  if (!args.install) console.log(`  ${args.pm} install`);
  console.log("  # Fill in DATABASE_URL (and any provider keys you want) in .env.local");
  console.log(`  ${args.pm} db:push        # create the database schema`);
  console.log(`  ${args.pm} db:seed        # create the owner account (ADMIN_EMAIL/ADMIN_PASSWORD in .env.local)`);
  console.log(`  ${args.pm} dev            # start the dev server`);
  console.log("\nSee README.md and docs/admin.md for the full setup and owner bootstrap steps.");
}

main().catch((error) => {
  console.error(`create-admin: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
