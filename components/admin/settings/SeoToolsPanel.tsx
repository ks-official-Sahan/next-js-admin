"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { pingIndexNowAction, regenerateLlmsTxtAction, regenerateSitemapAction } from "@/lib/actions/seo";

/** Three independent actions: each has its own ActionForm so one failing
 * request never blocks or clears the others. */
export default function SeoToolsPanel({ indexNowConfigured }: { indexNowConfigured: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <ActionForm action={regenerateLlmsTxtAction} className="contents">
        <SubmitButton variant="secondary" pendingLabel="Regenerating...">
          Regenerate llms.txt
        </SubmitButton>
      </ActionForm>

      <ActionForm action={regenerateSitemapAction} className="contents">
        <SubmitButton variant="secondary" pendingLabel="Regenerating...">
          Regenerate sitemap
        </SubmitButton>
      </ActionForm>

      <ActionForm action={pingIndexNowAction} className="contents">
        <SubmitButton variant="secondary" pendingLabel="Pinging...">
          Ping IndexNow
        </SubmitButton>
      </ActionForm>

      {!indexNowConfigured ? (
        <p className="w-full text-xs text-muted-foreground">
          INDEXNOW_KEY is not set — the ping button will fail until it is configured.
        </p>
      ) : null}
    </div>
  );
}
