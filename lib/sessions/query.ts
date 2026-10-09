import type { SessionCursor, SessionStatusFilter } from "@/lib/data/user-sessions";

// The sessions screen's view lives in the URL (?q=&status=&user=&after=), so a
// filtered list can be linked (the users screen links to one person's
// sessions), reloaded and navigated with Back. Paging is keyset: `after`
// names the last row of the previous page as `<lastSeenAt ms>.<id>`, so deep
// pages cost the same as the first. Unknown values fall back to the default.

export const SESSION_PAGE_SIZE = 50;

const STATUSES = ["active", "ended", "all"] as const satisfies readonly SessionStatusFilter[];
/** Row ids are cuids; anything else in `user` or `after` is ignored rather than sent to the database. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface SessionView {
  q?: string;
  status: SessionStatusFilter;
  /** Only this person's sessions. */
  user?: string;
  after?: SessionCursor;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

export function encodeCursor(cursor: SessionCursor): string {
  return `${cursor.lastSeenAt.getTime()}.${cursor.id}`;
}

export function decodeCursor(text: string | undefined): SessionCursor | undefined {
  const match = text ? /^(\d{1,15})\.(.+)$/.exec(text) : null;
  if (!match || !ID.test(match[2])) return undefined;
  const lastSeenAt = new Date(Number(match[1]));
  return Number.isNaN(lastSeenAt.getTime()) ? undefined : { lastSeenAt, id: match[2] };
}

export function parseSessionView(params: SearchParams): SessionView {
  const rawStatus = first(params.status);
  // `?ended=1` was the old "include ended sessions" switch; keep those links working.
  const status = (STATUSES as readonly string[]).includes(rawStatus ?? "")
    ? (rawStatus as SessionStatusFilter)
    : first(params.ended) === "1"
      ? "all"
      : "active";
  const user = first(params.user);
  return {
    q: first(params.q)?.slice(0, 100),
    status,
    user: user && ID.test(user) ? user : undefined,
    after: decodeCursor(first(params.after)),
  };
}

/** Query string for a view (with `?`, or "" for the plain list); defaults are left out. */
export function sessionViewSearch(view: SessionView, patch: Partial<SessionView> = {}): string {
  const next = { ...view, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "active") params.set("status", next.status);
  if (next.user) params.set("user", next.user);
  if (next.after) params.set("after", encodeCursor(next.after));
  const text = params.toString();
  return text ? `?${text}` : "";
}
