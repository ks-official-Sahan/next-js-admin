"use client";

import { useActionState, useEffect } from "react";

import LocalDateTimeField from "@/components/admin/ui/LocalDateTimeField";
import { buttonVariants, fieldClass } from "@/components/admin/ui/styles";
import { setPostStatusAction } from "@/lib/actions/blog";
import { idleState } from "@/lib/actions/state";
import { toast } from "@/lib/admin/toast";

// Publish / unpublish / archive / schedule for a saved post. These are submit
// buttons with their own formAction inside the editor's <form>, never a
// nested <form>: HTML forbids nesting, the parser drops the inner tag, and
// the server HTML then disagrees with the hydrated tree. A formAction submit
// also sends the editor's fields, but setPostStatusAction reads only `id`,
// `action` and `publishAt`, so unsaved edits are ignored, never written.

type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

export default function PostStatusControls({ status, publishAt }: { status: PostStatus; publishAt: string | null }) {
  const [state, dispatch, pending] = useActionState(setPostStatusAction, idleState);

  useEffect(() => {
    if (state.message) toast.success(state.message);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "PUBLISHED" ? (
          <button type="submit" formAction={dispatch} name="action" value="publish" disabled={pending} className={buttonVariants.small}>
            Publish now
          </button>
        ) : null}
        {status !== "DRAFT" && status !== "ARCHIVED" ? (
          <button type="submit" formAction={dispatch} name="action" value="unpublish" disabled={pending} className={buttonVariants.small}>
            Move to draft
          </button>
        ) : null}
        {status !== "ARCHIVED" ? (
          <button type="submit" formAction={dispatch} name="action" value="archive" disabled={pending} className={buttonVariants.smallDanger}>
            Archive
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Acts on the last saved version. Save first to include your edits.</p>

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Schedule for later</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="post-publish-at" className="sr-only">
            Publish at
          </label>
          <LocalDateTimeField id="post-publish-at" name="publishAt" defaultValue={publishAt} className={fieldClass} />
          <button type="submit" formAction={dispatch} name="action" value="schedule" disabled={pending} className={buttonVariants.small}>
            {pending ? "Saving…" : "Schedule"}
          </button>
        </div>
        {state.fieldErrors?.publishAt ? <p className="mt-1 text-xs text-destructive">{state.fieldErrors.publishAt}</p> : null}
      </details>
    </div>
  );
}
