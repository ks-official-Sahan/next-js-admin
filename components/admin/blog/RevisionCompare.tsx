"use client";

import { useState } from "react";

import Sheet from "@/components/admin/ui/Sheet";
import { buttonVariants } from "@/components/admin/ui/styles";
import type { DiffRow } from "@/lib/admin/diff";
import type { LineOp } from "@/lib/admin/text-diff";
import { cn } from "@/lib/utils";

// "Compare" for one revision in the History panel: fetches the revision
// against the post as it is now (app/api/admin/blog/[id]/revisions/[revisionId])
// and shows changed fields plus a paragraph diff of the body. Read only; the
// Restore button next to it is what changes the post.

type Comparison = { fields: DiffRow[]; content: LineOp[] };
type State = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "ready"; data: Comparison };

const LINE_CLASS: Record<"same" | "removed" | "added", string> = {
  same: "text-muted-foreground",
  removed: "bg-destructive/10 text-destructive line-through decoration-destructive/40",
  added: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};
const LINE_MARK = { same: " ", removed: "−", added: "+" } as const;

export default function RevisionCompare({ postId, revisionId, title }: { postId: string; revisionId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  async function show() {
    setOpen(true);
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/admin/blog/${encodeURIComponent(postId)}/revisions/${encodeURIComponent(revisionId)}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as (Comparison & { error?: string }) | null;
      if (!response.ok || !body || body.error) {
        setState({ status: "error", message: body?.error ?? "Could not load this comparison." });
        return;
      }
      setState({ status: "ready", data: body });
    } catch {
      setState({ status: "error", message: "Could not load this comparison." });
    }
  }

  const unchanged = state.status === "ready" && state.data.fields.length === 0 && state.data.content.every((op) => op.kind === "same" || op.kind === "skip");

  return (
    <>
      <button type="button" onClick={show} className={buttonVariants.small}>
        Compare
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Compare with current" description={`"${title}" against the post as it is now.`}>
        {state.status === "loading" ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
        {unchanged ? <p className="text-sm text-muted-foreground">This revision matches the current post.</p> : null}
        {state.status === "ready" && !unchanged ? (
          <div className="space-y-6">
            {state.data.fields.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Fields</h3>
                <dl className="space-y-2 text-sm">
                  {state.data.fields.map((row) => (
                    <div key={row.path} className="rounded-md border border-border p-2">
                      <dt className="font-mono text-xs text-muted-foreground">{row.path}</dt>
                      {row.before !== undefined ? <dd className={cn("mt-1 break-words", LINE_CLASS.removed)}>{row.before}</dd> : null}
                      {row.after !== undefined ? <dd className={cn("mt-1 break-words", LINE_CLASS.added)}>{row.after}</dd> : null}
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Body</h3>
              <ol className="space-y-0.5 text-sm" aria-label="Body changes: lines marked minus are only in the revision, plus only in the current post">
                {state.data.content.map((op, index) =>
                  op.kind === "skip" ? (
                    <li key={index} className="py-1 text-xs text-muted-foreground">
                      … {op.count} unchanged {op.count === 1 ? "paragraph" : "paragraphs"}
                    </li>
                  ) : (
                    <li key={index} className={cn("flex gap-2 rounded px-1 py-0.5", LINE_CLASS[op.kind])}>
                      <span aria-hidden className="w-3 shrink-0 font-mono">
                        {LINE_MARK[op.kind]}
                      </span>
                      <span className="sr-only">{op.kind === "same" ? "Unchanged:" : op.kind === "removed" ? "Only in revision:" : "Only in current:"}</span>
                      <span className="min-w-0 break-words">{op.text}</span>
                    </li>
                  )
                )}
              </ol>
            </section>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
