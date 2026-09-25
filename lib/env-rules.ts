// Pure environment rules. No server-only import, so instrumentation.ts can load
// this file. Messages name variables and lengths, never values.

export type EnvSource = Record<string, string | undefined>;

export interface SecretRule {
  name: string;
  /** Minimum length in characters. */
  min: number;
  /** True when production refuses to start without it (admin is enabled). */
  required: boolean;
}

export const SECRET_RULES: readonly SecretRule[] = [
  { name: "AUTH_SECRET", min: 32, required: true },
  { name: "INTERNAL_SIGNING_SECRET", min: 32, required: true },
  { name: "ADMIN_LOGIN_UNLOCK_SECRET", min: 12, required: true },
  { name: "MEDIA_SIGNING_SECRET", min: 32, required: false },
  { name: "CRON_SECRET", min: 32, required: false },
  { name: "MAINTENANCE_BYPASS_SECRET", min: 12, required: false },
];

export interface EnvProblem {
  name: string;
  kind: "missing" | "too-short" | "forbidden";
  message: string;
}

/** Problems with the secrets and provider settings. Values are never included. */
export function envProblems(source: EnvSource): EnvProblem[] {
  const problems: EnvProblem[] = [];

  for (const rule of SECRET_RULES) {
    const value = source[rule.name]?.trim() ?? "";
    if (value === "") {
      if (rule.required) {
        problems.push({ name: rule.name, kind: "missing", message: `${rule.name} is not set` });
      }
      continue;
    }
    if (value.length < rule.min) {
      problems.push({
        name: rule.name,
        kind: "too-short",
        message: `${rule.name} must be at least ${rule.min} characters`,
      });
    }
  }

  if ((source.EMAIL_PROVIDER ?? "").trim().toLowerCase() === "capture") {
    problems.push({
      name: "EMAIL_PROVIDER",
      kind: "forbidden",
      message: 'EMAIL_PROVIDER must not be "capture" in production',
    });
  }

  return problems;
}

/**
 * The production check applies only to a running production server that has a
 * database, so a database-less deploy of the public site still starts, and
 * `next build` never fails on a missing secret.
 */
export function shouldEnforce(source: EnvSource): boolean {
  return (
    source.NODE_ENV === "production" &&
    source.NEXT_PHASE !== "phase-production-build" &&
    Boolean(source.DATABASE_URL)
  );
}

/** Throws with variable names only when the production environment is unsafe. */
export function assertProductionEnv(source: EnvSource = process.env): void {
  if (!shouldEnforce(source)) return;
  const problems = envProblems(source);
  if (problems.length === 0) return;
  throw new Error(`Invalid production environment: ${problems.map((p) => p.message).join("; ")}`);
}

/** Development only: warns about secrets that are too short to deploy. */
export function warnDevEnv(
  source: EnvSource = process.env,
  warn: (message: string) => void = console.warn
): EnvProblem[] {
  if (source.NODE_ENV === "production") return [];
  const weak = envProblems(source).filter((problem) => problem.kind === "too-short");
  if (weak.length > 0) {
    warn(
      `[env] Short secrets are fine locally but production will refuse to start: ${weak
        .map((problem) => problem.message)
        .join("; ")}`
    );
  }
  return weak;
}

/** Splits a comma separated list, trimming blanks. */
export function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
