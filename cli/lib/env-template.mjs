// @ts-check

import { randomBytes } from "node:crypto";

/**
 * True for env var names that must be filled with a fresh random value: the
 * app's own AUTH_SECRET plus every other `*_SECRET` signing/unlock secret
 * (INTERNAL_SIGNING_SECRET, MEDIA_SIGNING_SECRET, MAINTENANCE_BYPASS_SECRET,
 * ADMIN_LOGIN_UNLOCK_SECRET, CRON_SECRET as of this template) and any
 * `*_SIGNING_KEY` a future variable might add.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSecretVarName(name) {
  return /_SECRET$/.test(name) || /_SIGNING_KEY$/.test(name);
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Renders `.env.local` content from `.env.example`: every blank `NAME=`
 * assignment whose name looks like a secret gets a fresh random value from
 * `genSecret`; every other blank assignment (provider keys, optional config)
 * is left blank for the owner to fill in; lines that already carry a value
 * (defaults like `EMAIL_PROVIDER=auto`) and comments/blank lines pass
 * through unchanged.
 *
 * @param {string} envExampleContent
 * @param {() => string} [genSecret]
 * @returns {string}
 */
export function renderEnvLocal(envExampleContent, genSecret = randomSecret) {
  const ASSIGNMENT_RE = /^([A-Z][A-Z0-9_]*)=(.*)$/;
  const lines = envExampleContent.split("\n");
  const rendered = lines.map((line) => {
    const match = ASSIGNMENT_RE.exec(line);
    if (!match) return line;
    const [, name, value] = match;
    if (value.trim() !== "") return line;
    if (isSecretVarName(name)) return `${name}=${genSecret()}`;
    return line;
  });
  return rendered.join("\n");
}

/**
 * Names of every variable `renderEnvLocal` would fill with a random secret,
 * for the CLI's "generated secrets for: ..." summary line.
 *
 * @param {string} envExampleContent
 * @returns {string[]}
 */
export function listSecretVarNames(envExampleContent) {
  const ASSIGNMENT_RE = /^([A-Z][A-Z0-9_]*)=/;
  return envExampleContent
    .split("\n")
    .map((line) => ASSIGNMENT_RE.exec(line)?.[1])
    .filter(/** @returns {name is string} */ (name) => Boolean(name) && isSecretVarName(/** @type {string} */ (name)));
}
