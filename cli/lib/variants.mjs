// @ts-check
import { existsSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Auth engines and ORMs a template can be scaffolded with. The first of each is the default. */
export const AUTH_VALUES = /** @type {const} */ (["next-auth", "better-auth"]);
export const ORM_VALUES = /** @type {const} */ (["prisma", "drizzle"]);

/** @typedef {(typeof AUTH_VALUES)[number]} AuthEngine */
/** @typedef {(typeof ORM_VALUES)[number]} Orm */
/**
 * @typedef {{
 *   overlay?: string,
 *   remove?: string[],
 *   dependencies?: Record<string, string | null>,
 *   devDependencies?: Record<string, string | null>,
 *   scripts?: Record<string, string | null>,
 *   env?: { remove?: string[] },
 * }} VariantSpec
 */

const MANIFEST = path.join("variants", "variants.json");

/** `rel` inside `root`, or a thrown error: the manifest must never reach outside the project. */
function inside(root, rel) {
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`variants.json path leaves the project: ${rel}`);
  return target;
}

/** @param {Record<string, unknown>} object */
function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * @param {Record<string, any>} pkg
 * @param {VariantSpec[]} specs
 */
export function editPackageJson(pkg, specs) {
  for (const spec of specs) {
    for (const field of /** @type {const} */ (["dependencies", "devDependencies", "scripts"])) {
      for (const [name, value] of Object.entries(spec[field] ?? {})) {
        pkg[field] ??= {};
        if (value === null) delete pkg[field][name];
        else pkg[field][name] = value;
      }
    }
  }
  for (const field of ["dependencies", "devDependencies"]) if (pkg[field]) pkg[field] = sortKeys(pkg[field]);
  return pkg;
}

/**
 * Drops each listed variable's line, set or commented out, from an env file.
 * @param {string} text
 * @param {string[]} names
 */
export function removeEnvVars(text, names) {
  if (names.length === 0) return text;
  const pattern = new RegExp(`^#?\\s*(${names.join("|")})=.*(\\r?\\n|$)`, "gm");
  return text.replace(pattern, "");
}

/**
 * Turns a downloaded template into the chosen auth engine and ORM, in place:
 * copies the overlays, deletes what the choice does not use, edits
 * package.json and .env.example, and removes variants/. A template without
 * variants/ (older than this CLI) only works with the defaults.
 *
 * @param {string} dir
 * @param {{ auth: AuthEngine, orm: Orm }} choice
 */
export async function applyVariants(dir, choice) {
  const root = path.resolve(dir);
  const manifestPath = path.join(root, MANIFEST);
  if (!existsSync(manifestPath)) {
    if (choice.auth === AUTH_VALUES[0] && choice.orm === ORM_VALUES[0]) return;
    throw new Error(`This template version has no variants; --auth ${choice.auth} --orm ${choice.orm} needs a newer --ref.`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  /** @type {VariantSpec | undefined} */
  const auth = manifest.auth?.[choice.auth];
  /** @type {VariantSpec | undefined} */
  const orm = manifest.orm?.[choice.orm];
  if (!auth) throw new Error(`This template version has no "${choice.auth}" auth engine.`);
  if (!orm) throw new Error(`This template version has no "${choice.orm}" ORM.`);
  /** @type {VariantSpec | undefined} */
  const combo = manifest.combos?.[`${choice.auth}+${choice.orm}`];

  for (const spec of [auth, orm, combo]) {
    if (spec?.overlay) await cp(inside(root, spec.overlay), root, { recursive: true, force: true });
  }
  for (const spec of [auth, orm]) {
    for (const rel of spec.remove ?? []) await rm(inside(root, rel), { recursive: true, force: true });
  }

  const pkgPath = path.join(root, "package.json");
  const pkg = editPackageJson(JSON.parse(await readFile(pkgPath, "utf8")), [auth, orm]);
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  const envPath = path.join(root, ".env.example");
  const envRemove = [...(auth.env?.remove ?? []), ...(orm.env?.remove ?? [])];
  if (envRemove.length > 0 && existsSync(envPath)) {
    await writeFile(envPath, removeEnvVars(await readFile(envPath, "utf8"), envRemove), "utf8");
  }

  await rm(path.join(root, "variants"), { recursive: true, force: true });
}
