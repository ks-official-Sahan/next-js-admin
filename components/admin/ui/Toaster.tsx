"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  NO_TOASTS,
  dismissToast,
  getToasts,
  subscribeToasts,
  type ToastKind,
} from "@/lib/admin/toast";
import { cn } from "@/lib/utils";

const kinds: Record<ToastKind, { Icon: typeof Info; icon: string }> = {
  success: { Icon: CircleCheck, icon: "text-emerald-600 dark:text-emerald-400" },
  error: { Icon: CircleAlert, icon: "text-red-600 dark:text-red-400" },
  info: { Icon: Info, icon: "text-muted-foreground" },
};

/** Renders the toast queue. Mounted once by the admin shell. */
export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => NO_TOASTS);

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4"
    >
      {toasts.map((item) => {
        const { Icon, icon } = kinds[item.kind];
        return (
          <div
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-border bg-card p-3 text-sm text-card-foreground shadow-md animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
          >
            <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", icon)} />
            <p className="min-w-0 flex-1 break-words">{item.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(item.id)}
              className="-m-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
