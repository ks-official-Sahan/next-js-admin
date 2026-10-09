"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { fieldClass } from "@/components/admin/ui/styles";
import type { SessionStatusFilter } from "@/lib/data/user-sessions";
import { sessionViewSearch, type SessionView } from "@/lib/sessions/query";
import { cn } from "@/lib/utils";

// Search and filters for the sessions screen, all in the URL (the same
// pattern as components/admin/users/UsersToolbar.tsx). A filter change starts
// again from the newest session. Without JavaScript it is a plain GET form.

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_LABEL: Record<SessionStatusFilter, string> = {
  active: "Active",
  ended: "Ended or expired",
  all: "All sessions",
};

export default function SessionsToolbar({ view, userLabel, shown }: { view: SessionView; userLabel: string | null; shown: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // See UsersToolbar: text typed while a search navigation runs is kept.
  const urlQ = view.q ?? "";
  const [search, setSearch] = useState({ value: urlQ, requested: urlQ });
  if (!pending && urlQ !== search.requested) setSearch({ value: urlQ, requested: urlQ });
  const input = search.value;

  const navigate = (patch: Partial<SessionView>, mode: "push" | "replace") => {
    if ("q" in patch) setSearch((current) => ({ ...current, requested: patch.q ?? "" }));
    const url = `${pathname}${sessionViewSearch(view, { ...patch, after: undefined })}`;
    startTransition(() => (mode === "push" ? router.push(url, { scroll: false }) : router.replace(url, { scroll: false })));
  };

  useEffect(() => {
    const q = input.trim();
    if (q === search.requested) return;
    const url = `${pathname}${sessionViewSearch(view, { q: q || undefined, after: undefined })}`;
    const timer = setTimeout(() => {
      setSearch((current) => ({ ...current, requested: q }));
      startTransition(() => router.replace(url, { scroll: false }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, search.requested, view, pathname, router]);

  return (
    <div className="space-y-2">
      <form
        role="search"
        action={pathname}
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q: input.trim() || undefined }, "push");
        }}
        className="flex flex-wrap items-center gap-2"
      >
        {view.user ? <input type="hidden" name="user" value={view.user} /> : null}
        <div className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="sessions-q" className="sr-only">
            Search sessions by name, email or IP address
          </label>
          <input
            id="sessions-q"
            type="search"
            name="q"
            value={input}
            onChange={(event) => setSearch((current) => ({ ...current, value: event.target.value }))}
            placeholder="Search name, email or IP"
            maxLength={100}
            autoComplete="off"
            className={cn(fieldClass, "pl-9")}
          />
        </div>
        <label htmlFor="sessions-status" className="sr-only">
          Status
        </label>
        <select
          id="sessions-status"
          name="status"
          value={view.status}
          onChange={(event) => navigate({ status: event.target.value as SessionStatusFilter }, "push")}
          className={cn(fieldClass, "w-auto")}
        >
          {(Object.keys(STATUS_LABEL) as SessionStatusFilter[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
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
            `${shown} shown`
          )}
        </span>
      </form>
      {view.user ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1">
            Only {userLabel ?? "one person"}
            <Link
              href={`${pathname}${sessionViewSearch(view, { user: undefined, after: undefined })}`}
              scroll={false}
              aria-label="Show everyone's sessions"
              className="-mr-1 inline-flex size-5 items-center justify-center rounded-full hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-3.5" />
            </Link>
          </span>
        </p>
      ) : null}
    </div>
  );
}
