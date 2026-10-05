import { ROLES, type RoleName } from "@/lib/auth/permissions";
import type { UserQuery, UserSort, UserStatusFilter } from "@/lib/data/users";

// The users screen's view lives in the URL (?q=&role=&status=&sort=&page=),
// so a filtered list can be linked, reloaded and navigated with Back. Pure and
// isomorphic: the page parses it on the server, the toolbar and column
// headers build links from it. Anything unknown falls back to the default
// instead of failing, so a stale or hand-edited URL still renders.

export const USER_PAGE_SIZE = 25;

const SORTS = ["name", "email", "role", "last-login", "created"] as const satisfies readonly Exclude<UserSort, "default">[];
const STATUSES = ["active", "disabled", "must-change", "two-factor", "no-two-factor"] as const satisfies readonly UserStatusFilter[];

export interface UserView {
  q?: string;
  role?: RoleName;
  status?: UserStatusFilter;
  sort: UserSort;
  dir: "asc" | "desc";
  page: number;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** `sort` is a column name, with a leading "-" for descending (`-last-login`). */
export function parseUserView(params: SearchParams): UserView {
  const rawSort = first(params.sort) ?? "";
  const descending = rawSort.startsWith("-");
  const sort = oneOf(descending ? rawSort.slice(1) : rawSort, SORTS) ?? "default";
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    q: first(params.q)?.slice(0, 100),
    role: oneOf(first(params.role), ROLES),
    status: oneOf(first(params.status), STATUSES),
    sort,
    dir: sort !== "default" && descending ? "desc" : "asc",
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), 10_000) : 1,
  };
}

export function userQueryOf(view: UserView, pageSize = USER_PAGE_SIZE): UserQuery {
  return {
    q: view.q,
    role: view.role,
    status: view.status,
    sort: view.sort,
    dir: view.dir,
    offset: (view.page - 1) * pageSize,
    limit: pageSize,
  };
}

/** The `sort` param for a view ("" for the default). */
export function sortParam(view: Pick<UserView, "sort" | "dir">): string {
  if (view.sort === "default") return "";
  return view.dir === "desc" ? `-${view.sort}` : view.sort;
}

/** Query string for a view (with `?`, or "" for the plain list); defaults are left out so URLs stay short. */
export function userViewSearch(view: UserView, patch: Partial<UserView> = {}): string {
  const next = { ...view, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.role) params.set("role", next.role);
  if (next.status) params.set("status", next.status);
  const sort = sortParam(next);
  if (sort) params.set("sort", sort);
  if (next.page > 1) params.set("page", String(next.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** True when the view narrows the list (a search or a filter), so an empty result says "no matches", not "no users". */
export const isFiltered = (view: UserView) => Boolean(view.q || view.role || view.status);
