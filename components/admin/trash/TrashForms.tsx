"use client";

import ActionForm, { ConfirmSubmitButton, SubmitButton } from "@/components/admin/ui/ActionForm";
import { purgeTrashAction, restoreTrashAction } from "@/lib/actions/trash";

export function RestoreTrashForm({ id }: { id: string }) {
  return (
    <ActionForm action={restoreTrashAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="small" pendingLabel="Restoring...">
        Restore
      </SubmitButton>
    </ActionForm>
  );
}

export function PurgeTrashForm({ id, label }: { id: string; label: string }) {
  return (
    <ActionForm action={purgeTrashAction}>
      <input type="hidden" name="id" value={id} />
      <ConfirmSubmitButton variant="smallDanger" pendingLabel="Deleting..." confirmMessage={`Delete "${label}" forever? This cannot be undone.`}>
        Delete forever
      </ConfirmSubmitButton>
    </ActionForm>
  );
}
