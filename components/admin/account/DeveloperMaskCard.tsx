"use client";

import { useState } from "react";

import ActionForm, { ConfirmSubmitButton, Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { confirmMaskChangeAction, requestMaskChangeAction } from "@/lib/actions/mask";

type Scope = "self" | "global";

const COPY: Record<Scope, { title: string; on: string; off: string; confirmOn: string; confirmOff: string }> = {
  self: {
    title: "Show me as a super admin",
    on: "On: everyone but developers sees you as a super admin.",
    off: "Off: everyone sees you as a developer.",
    confirmOn: "Mask yourself as a super admin? Everyone but developers will see you as one. A code will be emailed to you to confirm.",
    confirmOff: "Unmask yourself? Everyone will see you as a developer again. A code will be emailed to you to confirm.",
  },
  global: {
    title: "Show every developer as a super admin",
    on: "On: every developer shows as a super admin to everyone else.",
    off: "Off: only developers who masked themselves are masked.",
    confirmOn: "Mask every developer as a super admin? The developer role disappears for everyone else. A code will be emailed to you to confirm.",
    confirmOff: "Stop masking every developer? Developers who masked themselves stay masked. A code will be emailed to you to confirm.",
  },
};

/**
 * The two masking switches. Each change is confirmed, then applied only with
 * the code emailed to the developer (lib/actions/mask.ts). The account page
 * renders this for developers only; the actions refuse anyone else as well.
 */
export default function DeveloperMaskCard({ masked, global, email }: { masked: boolean; global: boolean; email: string }) {
  const [pending, setPending] = useState<{ ticket: string; scope: Scope; on: boolean } | null>(null);

  if (pending) {
    return (
      <ActionForm action={confirmMaskChangeAction} onResult={(result) => result.ok && setPending(null)} className="space-y-4">
        <input type="hidden" name="challengeId" value={pending.ticket} />
        <p className="text-sm text-muted-foreground">
          To {pending.on ? "turn on" : "turn off"} &ldquo;{COPY[pending.scope].title.toLowerCase()}&rdquo;, enter the 6 digit code sent
          to <span className="font-medium text-foreground">{email}</span>.
        </p>
        <Field label="6 digit code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} autoFocus />
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Checking...">Confirm</SubmitButton>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
        </div>
      </ActionForm>
    );
  }

  const row = (scope: Scope, on: boolean) => (
    <ActionForm
      key={scope}
      action={requestMaskChangeAction}
      onResult={(result) => {
        if (result.ok && result.challengeId) setPending({ ticket: result.challengeId, scope, on: !on });
      }}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="on" value={String(!on)} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{COPY[scope].title}</p>
        <p className="text-xs text-muted-foreground">{on ? COPY[scope].on : COPY[scope].off}</p>
      </div>
      <ConfirmSubmitButton
        variant={on ? "secondary" : "primary"}
        pendingLabel="Sending code..."
        confirmMessage={on ? COPY[scope].confirmOff : COPY[scope].confirmOn}
      >
        {on ? "Turn off" : "Turn on"}
      </ConfirmSubmitButton>
    </ActionForm>
  );

  return (
    <div className="space-y-4">
      {row("self", masked)}
      {row("global", global)}
    </div>
  );
}
