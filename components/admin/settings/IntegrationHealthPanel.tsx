import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";

import type { IntegrationStatus } from "@/lib/admin/integrations";

/** Server component: configured/reachable for each external service. Never
 * receives or renders a secret value, only the booleans computed server side. */
export default function IntegrationHealthPanel({ statuses }: { statuses: IntegrationStatus[] }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {statuses.map((status) => (
        <li key={status.name} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
          <span className="font-medium">{status.name}</span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{status.configured ? "Configured" : "Not configured"}</span>
            {status.reachable === null ? (
              <CircleHelp aria-label="Not pinged" className="size-4" />
            ) : status.reachable ? (
              <CheckCircle2 aria-label="Reachable" className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle aria-label="Unreachable" className="size-4 text-red-600 dark:text-red-400" />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
