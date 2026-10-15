"use client";

import { useState, useTransition } from "react";

import Icon from "@/components/icons/Icon";
import { checkAiProviderAction, type AiCheckState } from "@/lib/actions/integrations";
import { Button } from "@/components/admin/ui/button";
import { cn } from "@/lib/utils";

// Manual AI reachability check for one Integration health row. Sends one
// short prompt (a few tokens) only when pressed; the result shows under the
// row in a live region, so a screen reader hears it without moving focus.

export default function AiCheckButton({ id, name }: { id: string; name: string }) {
  const [result, setResult] = useState<AiCheckState | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      try {
        setResult(await checkAiProviderAction(id));
      } catch {
        setResult({ ok: false, reachable: false, message: "The check could not run. Try again." });
      }
    });

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending} aria-label={`Check ${name} now`}>
        {pending ? <Icon lucideIconName="Loader2" className="size-3.5 animate-spin" /> : null}
        {pending ? "Checking…" : "Check"}
      </Button>
      <p
        role="status"
        className={cn(
          result
            ? "order-last flex basis-full items-start gap-1.5 text-xs " +
                (result.reachable ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")
            : "sr-only"
        )}
      >
        {result ? (
          <>
            <Icon lucideIconName={result.reachable ? "CheckCircle2" : "XCircle"} className="mt-px size-3.5" />
            <span>{result.message}</span>
          </>
        ) : null}
      </p>
    </>
  );
}
