"use client";

import { useActionState, useEffect, type MouseEvent } from "react";

import { buttonVariants } from "@/components/admin/ui/styles";
import { restorePostRevisionAction } from "@/lib/actions/blog";
import { idleState } from "@/lib/actions/state";
import { toast } from "@/lib/admin/toast";
import type { RevisionListItem } from "@/lib/blog/revision-queries";

import SidebarCard from "./SidebarCard";

// The post's saved versions, newest first (lib/blog/revisions.ts keeps the
// last 25). Restore buttons submit through their own formAction inside the
// editor's <form> instead of a nested <form>; restorePostRevisionAction reads
// only `postId` and `revisionId`. The edit page remounts the editor after a
// restore (its key is the newest "restore" revision), so every field shows
// the restored version.

const REASON_LABEL: Record<string, string> = {
  update: "Saved before an edit",
  restore: "Saved before a restore",
  ai: "Saved before AI changes",
};

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  return RELATIVE.format(Math.round(hours / 24), "day");
}

export default function RevisionHistoryCard({ postId, revisions }: { postId: string; revisions: RevisionListItem[] }) {
  const [state, dispatch, pending] = useActionState(restorePostRevisionAction, idleState);

  useEffect(() => {
    if (state.message) toast.success(state.message);
    if (state.error) toast.error(state.error);
  }, [state]);

  const confirmRestore = (event: MouseEvent<HTMLButtonElement>, title: string) => {
    if (!window.confirm(`Restore "${title}"? The current version stays in History.`)) event.preventDefault();
  };

  const handleRestore = (revisionId: string) => (formData: FormData) => {
    formData.set("revisionId", revisionId);
    dispatch(formData);
  };

  return (
    <SidebarCard title={`History${revisions.length ? ` (${revisions.length})` : ""}`} defaultOpen={false}>
      <input type="hidden" name="postId" value={postId} />
      {revisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No earlier versions yet. Each save keeps the previous version here.</p>
      ) : (
        <ol className="space-y-3" aria-busy={pending}>
          {revisions.map((revision) => (
            <li key={revision.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium" title={revision.title}>
                  {revision.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  <time dateTime={revision.createdAt} title={revision.createdAt} suppressHydrationWarning>
                    {ago(revision.createdAt)}
                  </time>
                  {" · "}
                  {REASON_LABEL[revision.reason] ?? revision.reason}
                  {revision.authorEmail ? ` · ${revision.authorEmail}` : ""}
                </p>
              </div>
              <button
                type="submit"
                formAction={handleRestore(revision.id)}
                disabled={pending}
                onClick={(event) => confirmRestore(event, revision.title)}
                className={buttonVariants.small}
              >
                Restore
              </button>
            </li>
          ))}
        </ol>
      )}
    </SidebarCard>
  );
}
