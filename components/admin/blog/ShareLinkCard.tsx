"use client";

import { startTransition, useActionState, useState } from "react";

import CopyField from "@/components/admin/ui/CopyField";
import { buttonVariants, fieldClass } from "@/components/admin/ui/styles";
import { createPostShareLinkAction } from "@/lib/actions/share";
import { idleState } from "@/lib/actions/state";
import { SHARE_LINK_DAYS, type ShareLinkDays } from "@/lib/blog/share-link";

import SidebarCard from "./SidebarCard";

// A signed link that shows this post as readers will see it, before it is
// public (app/(site)/preview/post/[id]). Sits inside the editor's <form>, so
// it calls the action itself instead of submitting that form.

export default function ShareLinkCard({ postId }: { postId: string }) {
  const [days, setDays] = useState<ShareLinkDays>(7);
  const [state, dispatch, pending] = useActionState(createPostShareLinkAction, idleState);

  function create() {
    const data = new FormData();
    data.set("postId", postId);
    data.set("shareDays", String(days));
    startTransition(() => dispatch(data));
  }

  return (
    <SidebarCard title="Share preview" defaultOpen={false}>
      <p className="text-sm text-muted-foreground">
        A link that shows the saved version of this post to anyone who has it, until it expires. Save first to share your latest changes.
      </p>
      <div className="mt-3 flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-sm">
          <span>Works for</span>
          <select className={fieldClass} value={days} onChange={(event) => setDays(Number(event.target.value) as ShareLinkDays)}>
            {SHARE_LINK_DAYS.map((option) => (
              <option key={option} value={option}>
                {option === 1 ? "1 day" : `${option} days`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={create} disabled={pending} className={buttonVariants.small}>
          {pending ? "Creating…" : "Create link"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.link ? <CopyField className="mt-3" label="Preview link" value={state.link} hint={state.message ?? undefined} autoCopy /> : null}
    </SidebarCard>
  );
}
