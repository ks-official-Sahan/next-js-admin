"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { fieldClass } from "@/components/admin/ui/styles";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { RoleName } from "@/lib/auth/permissions";
import type { UserStatusFilter } from "@/lib/data/users";
import { isFiltered, parseUserView, sortParam, userViewSearch, type UserView } from "@/lib/users/query";
import { cn } from "@/lib/utils";

// Search, filters and sort for the users screen, all in the URL. Typing
// searches once it pauses (replacing the history entry, so Back skips the
// keystrokes); a filter or sort change is a normal navigation. Without
// JavaScript it is a plain GET form with a Search button.

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_LABEL: Record<UserStatusFilter, string> = {
  active: "Active",
  disabled: "Disabled",
  "must-change": "Must change password",
  "two-factor": "Two-factor on",
  "no-two-factor": "Two-factor off",
};

const SORT_LABEL: [string, string][] = [
  ["", "Default order"],
  ["name", "Name, A to Z"],
  ["-name", "Name, Z to A"],
  ["email", "Email, A to Z"],
  ["role", "Role, highest first"],
  ["-role", "Role, lowest first"],
  ["-last-login", "Last sign-in, newest"],
  ["last-login", "Last sign-in, oldest"],
  ["-created", "Joined, newest"],
  ["created", "Joined, oldest"],
];

export default function UsersToolbar({ view, roles, total }: { view: UserView; roles: readonly RoleName[]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // `requested` is the query this box last navigated to. While that navigation
  // runs, the URL still has the old query and whatever is typed meanwhile is
  // kept; a URL that changes on its own (Back/Forward, Clear filters) replaces
  // the box's text, during render rather than in an effect.
  const urlQ = view.q ?? "";
  const [search, setSearch] = useState({ value: urlQ, requested: urlQ });
  if (!pending && urlQ !== search.requested) setSearch({ value: urlQ, requested: urlQ });
  const input = search.value;

  const navigate = (patch: Partial<UserView>, mode: "push" | "replace") => {
    if ("q" in patch) setSearch((current) => ({ ...current, requested: patch.q ?? "" }));
    const url = `${pathname}${userViewSearch(view, { ...patch, page: 1 })}`;
    startTransition(() => (mode === "push" ? router.push(url, { scroll: false }) : router.replace(url, { scroll: false })));
  };

  useEffect(() => {
    const q = input.trim();
    if (q === search.requested) return;
    const url = `${pathname}${userViewSearch(view, { q: q || undefined, page: 1 })}`;
    const timer = setTimeout(() => {
      setSearch((current) => ({ ...current, requested: q }));
      startTransition(() => router.replace(url, { scroll: false }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, search.requested, view, pathname, router]);

  return (
    <form
      role="search"
      action={pathname}
      onSubmit={(event) => {
        event.preventDefault();
        navigate({ q: input.trim() || undefined }, "push");
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative min-w-0 flex-1 basis-56">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="users-q" className="sr-only">
          Search users by name or email
        </label>
        <input
          id="users-q"
          type="search"
          name="q"
          value={input}
          onChange={(event) => setSearch((current) => ({ ...current, value: event.target.value }))}
          placeholder="Search name or email"
          maxLength={100}
          autoComplete="off"
          className={cn(fieldClass, "pl-9")}
        />
      </div>
      <label htmlFor="users-role" className="sr-only">
        Role
      </label>
      <select
        id="users-role"
        name="role"
        value={view.role ?? ""}
        onChange={(event) => navigate({ role: (event.target.value || undefined) as RoleName | undefined }, "push")}
        className={cn(fieldClass, "w-auto")}
      >
        <option value="">Any role</option>
        {roles.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
      <label htmlFor="users-status" className="sr-only">
        Status
      </label>
      <select
        id="users-status"
        name="status"
        value={view.status ?? ""}
        onChange={(event) => navigate({ status: (event.target.value || undefined) as UserStatusFilter | undefined }, "push")}
        className={cn(fieldClass, "w-auto")}
      >
        <option value="">Any status</option>
        {(Object.keys(STATUS_LABEL) as UserStatusFilter[]).map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status]}
          </option>
        ))}
      </select>
      <label htmlFor="users-sort" className="sr-only">
        Sort
      </label>
      <select
        id="users-sort"
        name="sort"
        value={sortParam(view)}
        onChange={(event) => {
          const { sort, dir } = parseUserView({ sort: event.target.value });
          navigate({ sort, dir }, "push");
        }}
        className={cn(fieldClass, "w-auto")}
      >
        {SORT_LABEL.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="h-10 rounded-md border border-input px-3 text-sm">
          Search
        </button>
      </noscript>
      <span className="flex min-w-24 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        {pending ? (
          <>
            <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
            Updating…
          </>
        ) : (
          `${total} ${total === 1 ? "user" : "users"}`
        )}
      </span>
      {isFiltered(view) ? (
        <Link href={pathname} scroll={false} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Clear filters
        </Link>
      ) : null}
    </form>
  );
}
