// @ts-check

/** @typedef {import("./pm.mjs").PackageManager} PackageManager */
/** @typedef {import("./variants.mjs").AuthEngine} AuthEngine */
/** @typedef {import("./variants.mjs").Orm} Orm */

/**
 * @typedef {{
 *   dir: string | undefined,
 *   ref: string,
 *   install: boolean,
 *   git: boolean,
 *   pm: PackageManager,
 *   auth: AuthEngine | undefined,
 *   orm: Orm | undefined,
 *   help: boolean,
 *   version: boolean,
 * }} ParsedArgs
 */

import { AUTH_VALUES, ORM_VALUES } from "./variants.mjs";

const PM_VALUES = /** @type {const} */ (["pnpm", "npm", "yarn", "bun"]);

/**
 * Parses `create-admin` CLI arguments. Throws a plain `Error` with a
 * human-readable message on anything invalid (unknown flag, `--ref`/`--pm`
 * missing its value, or an unsupported `--pm`); the caller is expected to
 * print `error.message` and exit non-zero.
 *
 * @param {string[]} argv - typically `process.argv.slice(2)`
 * @param {{ defaultRef: string, defaultPm: PackageManager }} defaults
 * @returns {ParsedArgs}
 */
export function parseArgs(argv, defaults) {
  /** @type {ParsedArgs} */
  const result = {
    dir: undefined,
    ref: defaults.defaultRef,
    install: true,
    git: true,
    pm: defaults.defaultPm,
    auth: undefined,
    orm: undefined,
    help: false,
    version: false,
  };

  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--version":
      case "-v":
        result.version = true;
        break;
      case "--no-install":
        result.install = false;
        break;
      case "--no-git":
        result.git = false;
        break;
      case "--ref": {
        const value = argv[++i];
        if (value === undefined) throw new Error("--ref requires a value, e.g. --ref v0.2.0");
        result.ref = value;
        break;
      }
      case "--pm": {
        const value = argv[++i];
        if (value === undefined) throw new Error("--pm requires a value: pnpm, npm, yarn, or bun");
        if (!isPackageManager(value)) {
          throw new Error(`Invalid --pm value: "${value}". Expected pnpm, npm, yarn, or bun.`);
        }
        result.pm = value;
        break;
      }
      case "--auth": {
        const value = argv[++i];
        if (value === undefined || !oneOf(AUTH_VALUES, value)) {
          throw new Error(`--auth must be one of: ${AUTH_VALUES.join(", ")}`);
        }
        result.auth = value;
        break;
      }
      case "--orm": {
        const value = argv[++i];
        if (value === undefined || !oneOf(ORM_VALUES, value)) {
          throw new Error(`--orm must be one of: ${ORM_VALUES.join(", ")}`);
        }
        result.orm = value;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    throw new Error(`Unexpected extra argument: ${positionals[1]}`);
  }
  if (positionals.length === 1) result.dir = positionals[0];

  return result;
}

/**
 * @template {string} T
 * @param {readonly T[]} values
 * @param {string} value
 * @returns {value is T}
 */
function oneOf(values, value) {
  return /** @type {readonly string[]} */ (values).includes(value);
}

/**
 * @param {string} value
 * @returns {value is PackageManager}
 */
function isPackageManager(value) {
  return /** @type {readonly string[]} */ (PM_VALUES).includes(value);
}

export const HELP_TEXT = `Usage: create-admin [dir] [options]

Scaffold a new project from the admin-template (auth, RBAC, CMS, blog,
media, leads, chatbot — a full admin panel starter on Next.js).

Arguments:
  dir                  Directory to create the project in (asked if omitted)

Options:
  --ref <git-ref>       Template tag/branch/commit to use (default: v<cli-version>)
  --pm <pnpm|npm|yarn|bun>  Package manager to install with (default: auto-detected)
  --auth <next-auth|better-auth>  Auth engine (asked if omitted; default: next-auth)
  --orm <prisma|drizzle>    ORM for the data layer (asked if omitted; default: prisma)
  --no-install           Skip installing dependencies
  --no-git                Skip \`git init\` and the initial commit
  -h, --help              Show this help
  -v, --version           Print the CLI version
`;
