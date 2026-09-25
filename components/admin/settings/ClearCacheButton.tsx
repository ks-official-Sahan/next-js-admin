"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { clearCacheAction } from "@/lib/actions/settings";

export default function ClearCacheButton() {
  return (
    <ActionForm action={clearCacheAction}>
      <SubmitButton variant="secondary" pendingLabel="Clearing...">
        Clear cache
      </SubmitButton>
    </ActionForm>
  );
}
