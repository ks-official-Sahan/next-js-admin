"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import type { Maintenance } from "@/lib/settings/schema";
import { updateMaintenanceAction } from "@/lib/actions/settings";

export default function MaintenanceForm({
  value,
  bypassConfigured,
}: {
  value: Maintenance;
  bypassConfigured: boolean;
}) {
  return (
    <ActionForm action={updateMaintenanceAction} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={value.enabled}
          className="size-4 rounded border-input"
        />
        Put the public site into maintenance mode
      </label>

      <Field label="Message shown to visitors" name="reason" multiline defaultValue={value.reason} />

      <Field
        label="Estimated end time (optional)"
        name="estimatedEndTime"
        type="datetime-local"
        defaultValue={value.estimatedEndTime ? value.estimatedEndTime.slice(0, 16) : undefined}
      />

      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {bypassConfigured
          ? "MAINTENANCE_BYPASS_SECRET is set. Open any URL once with ?bypass-secret=<the secret> to get a two hour bypass cookie for the real site, the same way the hidden admin unlock link works."
          : "MAINTENANCE_BYPASS_SECRET is not set, so there is no way to preview the live site while maintenance is on except from /admin itself."}
      </div>

      <p className="text-xs text-muted-foreground">
        /admin, /api/admin and /api/cron keep working while maintenance is on.
      </p>

      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
