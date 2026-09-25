// Tiny, dependency-free state checks used by loaders and the Prisma client.

type Env = Record<string, string | undefined>;

/** True when a database URL is present, so the CMS can read it. */
export function dbConfigured(env: Env = process.env): boolean {
  return Boolean(env.DATABASE_URL);
}

/** True while `next build` runs. Next sets NEXT_PHASE for the build process. */
export function isBuildPhase(env: Env = process.env): boolean {
  return env.NEXT_PHASE === "phase-production-build";
}
