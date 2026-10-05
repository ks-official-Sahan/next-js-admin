import { CheckCircle2, CircleHelp, Info, MinusCircle, XCircle } from "lucide-react";

import AiCheckButton from "@/components/admin/settings/AiCheckButton";
import type { IntegrationGroup, IntegrationStatus } from "@/lib/admin/integrations";
import { cn } from "@/lib/utils";

// Server component: configured/reachable for each external service, grouped.
// Every state is spelled out in text next to its icon (no hover needed on a
// phone), and each row has an info button that opens a native popover
// (Popover API: works on tap and keyboard, closes on Escape or outside tap,
// no client JavaScript) with the environment variable names and what the
// check does. AI rows are checked only on demand (AiCheckButton, a small
// client island), since their only real check is a prompt that spends
// tokens. Never receives or renders a secret value.

const GROUP_ORDER: IntegrationGroup[] = ["Core", "Email", "Media", "AI", "SEO"];

function state(status: IntegrationStatus) {
  if (!status.configured) return { label: "Not configured", Icon: MinusCircle, tone: "text-muted-foreground" };
  if (status.reachable === null && status.check) return { label: "Configured", Icon: CircleHelp, tone: "text-muted-foreground" };
  if (status.reachable === null) return { label: "Configured, not checked", Icon: CircleHelp, tone: "text-muted-foreground" };
  if (status.reachable) return { label: "Reachable", Icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-400" };
  return { label: "Unreachable", Icon: XCircle, tone: "text-red-700 dark:text-red-400" };
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function IntegrationHealthPanel({ statuses }: { statuses: IntegrationStatus[] }) {
  const groups = GROUP_ORDER.map((group) => ({ group, items: statuses.filter((status) => status.group === group) })).filter(
    ({ items }) => items.length > 0
  );
  const problems = statuses.filter((status) => status.configured && status.reachable === false).length;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {statuses.filter((status) => status.configured).length} of {statuses.length} configured
        {problems > 0 ? (
          <span className="font-medium text-red-700 dark:text-red-400">, {problems} unreachable</span>
        ) : null}
        . Results are cached for a minute. AI providers are checked only when you press Check, which spends a few tokens.
      </p>
      {groups.map(({ group, items }) => (
        <section key={group} aria-labelledby={`health-${group}`}>
          <h3 id={`health-${group}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((status) => {
              const { label, Icon, tone } = state(status);
              const popoverId = `health-hint-${slug(status.name)}`;
              return (
                <li key={status.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{status.name}</span>
                  <span className={cn("flex items-center gap-1.5 text-xs", tone)}>
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {label}
                  </span>
                  {status.check && status.configured ? <AiCheckButton id={status.check} name={status.name} /> : null}
                  <button
                    type="button"
                    popoverTarget={popoverId}
                    className="-mr-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`About the ${status.name} check`}
                    title={status.hint}
                  >
                    <Info aria-hidden className="size-4" />
                  </button>
                  <div
                    id={popoverId}
                    popover="auto"
                    className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg backdrop:bg-black/20"
                  >
                    <p className="font-semibold">{status.name}</p>
                    <p className={cn("mt-1 flex items-center gap-1.5 text-xs", tone)}>
                      <Icon aria-hidden className="size-4 shrink-0" />
                      {label}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{status.hint}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
