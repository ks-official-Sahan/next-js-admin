"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import ActionForm, { ConfirmSubmitButton, SubmitButton } from "@/components/admin/ui/ActionForm";
import { badgeClass, buttonVariants, fieldClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import type { ActionState } from "@/lib/actions/state";
import { bulkDeletePostsAction, bulkPostStatusAction } from "@/lib/actions/blog";
import { useAdminBlogPosts, useInvalidateAdminBlogPosts } from "@/lib/admin/hooks/use-blog-posts";
import {
  ADMIN_POST_STATUS_FILTERS,
  ADMIN_POSTS_PAGE_SIZE,
  adminPostListSearch,
  parseAdminPostListParams,
  type AdminPostListParams,
  type AdminPostRow,
  type AdminPostStatusFilter,
} from "@/lib/blog/admin-list-params";
import { cn } from "@/lib/utils";

export type BlogListRow = AdminPostRow;

const STATUS_LABEL: Record<AdminPostStatusFilter, string> = {
  all: "All statuses",
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_SELECTION: ReadonlySet<string> = new Set();

// The URL (?page, ?q, ?status) is the list's only state, so a filtered view
// can be bookmarked and Back works. Changes go through history.pushState /
// replaceState, which Next's router syncs into useSearchParams without a
// server round trip; React Query then fetches just the list JSON.
function navigate(params: AdminPostListParams, mode: "push" | "replace") {
  const search = adminPostListSearch(params);
  const url = search ? `?${search}` : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export default function BlogListClient({ canPublish, canDelete }: { canPublish: boolean; canDelete: boolean }) {
  const searchParams = useSearchParams();
  const params = useMemo(() => parseAdminPostListParams(searchParams), [searchParams]);

  const { data, isFetching, isError, error } = useAdminBlogPosts(params);
  const invalidate = useInvalidateAdminBlogPosts();
  const posts = useMemo(() => data?.posts ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Both are keyed to the URL they were made against, so Back/Forward or a new
  // filter resets them during render instead of through an effect.
  const urlKey = adminPostListSearch(params);
  const [search, setSearch] = useState({ q: params.q, value: params.q });
  const searchInput = search.q === params.q ? search.value : params.q;
  const [selection, setSelection] = useState({ key: urlKey, ids: new Set<string>() });
  const selected = selection.key === urlKey ? selection.ids : EMPTY_SELECTION;

  // Typing replaces the history entry (no Back step per keystroke) once it pauses.
  useEffect(() => {
    const q = searchInput.trim();
    if (q === params.q) return;
    const timer = setTimeout(() => navigate({ ...params, q, page: 1 }, "replace"), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, params]);

  const setSelected = (ids: Set<string>) => setSelection({ key: urlKey, ids });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => setSelected(selected.size === posts.length ? new Set() : new Set(posts.map((post) => post.id)));

  const idsJson = JSON.stringify([...selected]);
  const afterBulkAction = (state: ActionState) => {
    if (!state.ok) return;
    setSelected(new Set());
    void invalidate();
  };

  const firstRow = posts.length === 0 ? 0 : (params.page - 1) * ADMIN_POSTS_PAGE_SIZE + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearch({ q: params.q, value: event.target.value })}
          placeholder="Search title"
          aria-label="Search posts by title"
          className={cn(fieldClass, "max-w-xs")}
        />
        <select
          value={params.status}
          onChange={(event) => navigate({ ...params, status: event.target.value as AdminPostStatusFilter, page: 1 }, "push")}
          aria-label="Filter by status"
          className={fieldClass}
        >
          {ADMIN_POST_STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </select>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {isFetching ? "Updating…" : ""}
        </span>
      </div>

      {isError ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error instanceof Error ? error.message : "Could not load posts."}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          {canPublish ? (
            <ActionForm action={bulkPostStatusAction} onResult={afterBulkAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="ids" value={idsJson} />
              <SubmitButton name="action" value="publish" variant="small" pendingLabel="Working…">
                Publish
              </SubmitButton>
              <SubmitButton name="action" value="unpublish" variant="small" pendingLabel="Working…">
                Unpublish
              </SubmitButton>
              <SubmitButton name="action" value="archive" variant="smallDanger" pendingLabel="Working…">
                Archive
              </SubmitButton>
            </ActionForm>
          ) : null}
          {canDelete ? (
            <ActionForm action={bulkDeletePostsAction} onResult={afterBulkAction} className="flex items-center gap-2">
              <input type="hidden" name="ids" value={idsJson} />
              <ConfirmSubmitButton
                variant="smallDanger"
                pendingLabel="Deleting…"
                confirmMessage={`Delete ${selected.size} post${selected.size === 1 ? "" : "s"}? This cannot be undone.`}
              >
                Delete
              </ConfirmSubmitButton>
            </ActionForm>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto" aria-busy={isFetching}>
        <table className={cn(tableClass, isFetching && "opacity-70 transition-opacity")}>
          <thead>
            <tr className="border-b border-border">
              {canPublish || canDelete ? (
                <th className={thClass}>
                  <input
                    type="checkbox"
                    aria-label="Select all posts on this page"
                    checked={posts.length > 0 && selected.size === posts.length}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              <th className={thClass}>Title</th>
              <th className={thClass}>Topic</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Updated</th>
              <th className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-border/60">
                {canPublish || canDelete ? (
                  <td className={tdClass}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${post.title}`}
                      checked={selected.has(post.id)}
                      onChange={() => toggle(post.id)}
                    />
                  </td>
                ) : null}
                <td className={tdClass}>
                  <Link href={`/admin/blog/${post.id}`} className="font-medium hover:underline">
                    {post.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">/updates/{post.slug}</div>
                </td>
                <td className={tdClass}>{post.topic}</td>
                <td className={tdClass}>
                  <span className={badgeClass}>{STATUS_LABEL[post.status]}</span>
                </td>
                <td className={cn(tdClass, "text-sm text-muted-foreground")}>{new Date(post.updatedAt).toLocaleDateString()}</td>
                <td className={tdClass}>
                  <Link href={`/admin/blog/${post.id}`} className="text-sm text-primary hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {posts.length === 0 && !isFetching ? <p className="py-8 text-center text-sm text-muted-foreground">No posts match.</p> : null}
      </div>

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Showing {firstRow} to {Math.min(params.page * ADMIN_POSTS_PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate({ ...params, page: Math.max(1, params.page - 1) }, "push")}
              disabled={params.page <= 1}
              className={buttonVariants.small}
            >
              Previous
            </button>
            <span>
              Page {params.page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => navigate({ ...params, page: Math.min(totalPages, params.page + 1) }, "push")}
              disabled={params.page >= totalPages}
              className={buttonVariants.small}
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
