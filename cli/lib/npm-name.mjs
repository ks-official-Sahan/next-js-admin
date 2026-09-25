// @ts-check

// Same shape npm itself enforces for package names (see npm-package-arg /
// validate-npm-package-name): optionally scoped, lowercase, URL-safe,
// no leading dot or underscore, at most 214 characters total.
const NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const MAX_LENGTH = 214;

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isValidNpmName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= MAX_LENGTH && NAME_RE.test(name);
}

/**
 * Turns an arbitrary string (typically a directory name) into a valid,
 * unscoped npm package name: lowercase, spaces and invalid characters become
 * `-`, leading dots/underscores/dashes are stripped, and it is truncated to
 * npm's length limit. Never throws; a name that normalizes to nothing falls
 * back to a generic default.
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeToNpmName(input) {
  const lower = (input ?? "").trim().toLowerCase();
  let name = lower
    .replace(/[^a-z0-9-._~]+/g, "-")
    .replace(/^[-._]+/, "")
    .replace(/-{2,}/g, "-")
    .replace(/[-._]+$/, "");

  if (!name) name = "my-admin-app";
  if (name.length > MAX_LENGTH) name = name.slice(0, MAX_LENGTH);
  return name;
}
