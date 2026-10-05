// The web address used in emails and copied links: the first of the site's
// domains (SITE_URLS, in order) that answers its own health check, else the
// first that answers at all (a deployment without the health route yet, or
// one in trouble), else the first listed. A domain that does not resolve or
// times out never wins over one that answers. Never the request's Host
// header, which a caller controls. Pure and dependency injected, so the rules
// are unit tested without a network.

export const HEALTH_PATH = "/api/health";
/** The health route answers with this, so a parked domain's generic 200 never counts. */
export const HEALTH_SERVICE = "admin-site";

/** Origins only (`https://host[:port]`), http(s) only, in order, without repeats. */
export function siteUrlCandidates(
  env: { SITE_URLS?: readonly string[]; SITE_URL?: string },
  defaults: readonly string[]
): string[] {
  const listed = env.SITE_URLS?.length ? env.SITE_URLS : [env.SITE_URL, ...defaults];
  const origins = listed.flatMap((value) => {
    if (!value) return [];
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? [url.origin] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(origins)];
}

/** healthy: serves this app's health route. reachable: answers below 500 but not as this app. down: no answer, or 5xx. */
export type ProbeResult = "healthy" | "reachable" | "down";

export async function probeOrigin(
  origin: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {}
): Promise<ProbeResult> {
  const fetcher = options.fetch ?? fetch;
  try {
    const response = await fetcher(`${origin}${HEALTH_PATH}`, {
      redirect: "manual",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 2500),
    });
    if (response.status >= 500) return "down";
    if (response.status !== 200) return "reachable";
    const body = (await response.json().catch(() => null)) as { ok?: unknown; service?: unknown } | null;
    return body?.ok === true && body.service === HEALTH_SERVICE ? "healthy" : "reachable";
  } catch {
    return "down";
  }
}

export interface SharedCache {
  get(): Promise<string | null>;
  set(value: string, ttlSeconds: number): Promise<void>;
}

export interface ActiveUrlDeps {
  candidates: readonly string[];
  probe(origin: string): Promise<ProbeResult>;
  /** Shared across instances (Redis), so one probe serves every function instance. */
  shared?: SharedCache;
  now?: () => number;
  /** How long a healthy answer is kept. */
  ttlSeconds?: number;
  /** How long an answer short of healthy is kept; short, so recovery shows quickly. */
  fallbackTtlSeconds?: number;
}

export interface ActiveUrlStatus {
  active: string;
  /** Each candidate and whether it answered, in order. Empty when nothing was probed. */
  checked: { origin: string; state: ProbeResult }[];
}

export function createActiveUrlResolver(deps: ActiveUrlDeps) {
  const now = deps.now ?? Date.now;
  const ttl = deps.ttlSeconds ?? 300;
  const fallbackTtl = deps.fallbackTtlSeconds ?? 60;
  const first = deps.candidates[0] ?? "";
  let memory: { value: string; expires: number } | null = null;
  let inflight: Promise<ActiveUrlStatus> | null = null;

  /** Probes every candidate at once and keeps the first healthy one in order. */
  async function check(): Promise<ActiveUrlStatus> {
    const results = await Promise.all(deps.candidates.map((origin) => deps.probe(origin).catch((): ProbeResult => "down")));
    const checked = deps.candidates.map((origin, index) => ({ origin, state: results[index] }));
    const healthy = checked.find((entry) => entry.state === "healthy")?.origin;
    const active = healthy ?? checked.find((entry) => entry.state === "reachable")?.origin ?? first;
    const seconds = healthy ? ttl : fallbackTtl;
    memory = { value: active, expires: now() + seconds * 1000 };
    await deps.shared?.set(active, seconds).catch(() => undefined);
    return { active, checked };
  }

  /** One probe at a time per instance: concurrent callers share it. */
  function refresh(): Promise<ActiveUrlStatus> {
    inflight ??= check().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function resolve(): Promise<string> {
    if (deps.candidates.length <= 1) return first;
    if (memory && memory.expires > now()) return memory.value;
    const shared = await deps.shared?.get().catch(() => null);
    if (shared && deps.candidates.includes(shared)) {
      memory = { value: shared, expires: now() + Math.min(ttl, 60) * 1000 };
      return shared;
    }
    return (await refresh()).active;
  }

  return { resolve, refresh };
}
