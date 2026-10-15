import type { ReactNode } from "react";

// A ranked list with a proportional bar behind each row: top pages,
// referrers, countries, devices. Plain server-rendered HTML (no chart
// library), a real list for screen readers, and the bar is decoration only.

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Accessible text for the label when it is not plain text. */
  title?: string;
}

const numberFormat = new Intl.NumberFormat("en");

export default function BarList({ items, empty, unit = "views" }: { items: BarItem[]; empty: string; unit?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ol className="space-y-1.5">
      {items.map((item) => (
        <li key={item.key} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-sm">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-md bg-primary/10 dark:bg-primary/15"
            style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
          />
          <span className="relative min-w-0 truncate" title={item.title}>
            {item.label}
          </span>
          <span className="relative shrink-0 tabular-nums text-muted-foreground">
            {numberFormat.format(item.value)}
            <span className="sr-only"> {unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
