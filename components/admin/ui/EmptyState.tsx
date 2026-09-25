import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Placeholder for a screen or list with nothing to show yet. */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-muted-foreground [&_svg]:size-8">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-medium">{title}</h2>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
