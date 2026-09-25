// @ts-check

/** @typedef {"pnpm" | "npm" | "yarn" | "bun"} PackageManager */

const KNOWN = /** @type {const} */ (["pnpm", "npm", "yarn", "bun"]);

/**
 * Detects the package manager that invoked this CLI from npm's own
 * `npm_config_user_agent` env var (set by npm, pnpm, yarn and bun alike),
 * e.g. "pnpm/9.1.0 npm/? node/v20.11.0 win32 x64". Falls back to pnpm, since
 * that is what the template itself is built and tested with.
 *
 * @param {string | undefined} userAgent
 * @returns {PackageManager}
 */
export function detectPackageManager(userAgent) {
  if (!userAgent) return "pnpm";
  const token = userAgent.trim().split("/")[0]?.toLowerCase();
  return /** @type {PackageManager[]} */ (KNOWN).includes(/** @type {PackageManager} */ (token))
    ? /** @type {PackageManager} */ (token)
    : "pnpm";
}

/**
 * @param {PackageManager} pm
 * @returns {{ command: string, args: string[] }}
 */
export function installCommand(pm) {
  switch (pm) {
    case "npm":
      return { command: "npm", args: ["install"] };
    case "yarn":
      return { command: "yarn", args: [] };
    case "bun":
      return { command: "bun", args: ["install"] };
    case "pnpm":
    default:
      return { command: "pnpm", args: ["install"] };
  }
}

export const PACKAGE_MANAGERS = KNOWN;
