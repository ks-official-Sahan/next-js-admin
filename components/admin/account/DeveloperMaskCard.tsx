"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { setGlobalMaskAction, setOwnMaskAction } from "@/lib/actions/mask";

/**
 * The two masking switches. The account page renders this for developers
 * only; the actions refuse anyone else as well.
 */
export default function DeveloperMaskCard({ masked, global }: { masked: boolean; global: boolean }) {
  return (
    <div className="space-y-4">
      <ActionForm action={setOwnMaskAction} className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="masked" defaultChecked={masked} className="size-4 rounded border-input" />
          Show me as a super admin
        </label>
        <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
      </ActionForm>
      <ActionForm action={setGlobalMaskAction} className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="global" defaultChecked={global} className="size-4 rounded border-input" />
          Show every developer as a super admin
        </label>
        <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
      </ActionForm>
    </div>
  );
}
