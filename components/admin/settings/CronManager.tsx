"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { runCronJobAction } from "@/lib/actions/settings";

const JOBS = [
  {
    id: "blog-publish",
    label: "Publish scheduled posts",
    description: "Flips SCHEDULED posts whose publish time has come to PUBLISHED.",
  },
  {
    id: "session-cleanup",
    label: "Clean up sessions",
    description: "Deletes expired and revoked sessions, and expired invite/reset tokens and MFA challenges.",
  },
  {
    id: "audit-prune",
    label: "Prune audit log",
    description: "Deletes audit rows older than the retention period. Needs the settings permission.",
  },
] as const;

export default function CronManager({
  canRunCron,
  canRunAuditPrune,
}: {
  canRunCron: boolean;
  canRunAuditPrune: boolean;
}) {
  const visible = JOBS.filter((job) => (job.id === "audit-prune" ? canRunAuditPrune : canRunCron));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map((job) => (
        <div key={job.id} className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <div className="text-sm font-medium">{job.label}</div>
            <div className="text-xs text-muted-foreground">{job.description}</div>
          </div>
          <ActionForm action={runCronJobAction} showMessage={false}>
            <input type="hidden" name="job" value={job.id} />
            <SubmitButton variant="secondary" pendingLabel="Running...">
              Run now
            </SubmitButton>
          </ActionForm>
        </div>
      ))}
    </div>
  );
}
