"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import Icon from "@/components/icons/Icon";

// Re-reads the dashboard on the server (router.refresh keeps client state and
// scroll). The cached series is at most a minute old, which the header says.

export default function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-label="Refresh the dashboard"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <Icon name="refresh" className={`size-3.5 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} />
      {pending ? "Refreshing" : "Refresh"}
    </button>
  );
}
