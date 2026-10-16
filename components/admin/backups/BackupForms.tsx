"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { runBackupAction } from "@/lib/actions/backups";

export function RunBackupForm({ disabled }: { disabled: boolean }) {
  return (
    <ActionForm action={runBackupAction}>
      <SubmitButton pendingLabel="Backing up..." disabled={disabled}>{disabled ? "Back up now (not configured)" : "Back up now"}</SubmitButton>
    </ActionForm>
  );
}
