// Runs once when a server instance starts (docs: file-conventions/instrumentation).
// It only loads the pure env rules, never a module that connects to anything.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertProductionEnv, warnDevEnv } = await import("./lib/env-rules");

  // Production with a database: refuse to start on missing or short secrets.
  // No effect during `next build` or on a database-less deploy.
  assertProductionEnv();
  // Development: warn about secrets that are too short to deploy.
  warnDevEnv();
}

/**
 * One structured, redacted log line per unhandled server error (render, route
 * handler, server action, proxy), so failures show up in the platform's log
 * search with the route that failed. The query string is dropped (it can
 * carry ?secret= or ?token=) and headers are never logged (cookies).
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string; revalidateReason?: string }
) {
  const { log } = await import("./lib/log");
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  log.error("unhandled server error", {
    message: error instanceof Error ? error.message : String(error),
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    type: context.routeType,
    revalidate: context.revalidateReason,
  });
}
