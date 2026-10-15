import Link from "next/link";
import type { ReactNode } from "react";

import Sparkline from "./Sparkline";

// One number, where it comes from, and how it moved. Every tile is a link to
// the list behind the number, so a figure is never a dead end.

export interface StatTileProps {
  href: string;
  label: string;
  value: number;
  icon: ReactNode;
  /** What the number counts, in a few words. */
  caption: string;
  /** Last 30 days for the sparkline, oldest first. */
  trend?: number[];
  /** Change against the previous period, as "+3 vs last week". */
  delta?: { value: number; period: string };
  tone?: "default" | "attention";
}

const numberFormat = new Intl.NumberFormat("en");

export default function StatTile({ href, label, value, icon, caption, trend, delta, tone = "default" }: StatTileProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group relative flex h-full flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          aria-hidden="true"
          className={`flex size-8 items-center justify-center rounded-lg ${tone === "attention" && value > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold tabular-nums tracking-tight">{numberFormat.format(value)}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {caption}
            {delta ? (
              <span className={`ml-1.5 font-medium ${delta.value > 0 ? "text-foreground" : ""}`}>
                {delta.value > 0 ? "+" : ""}
                {numberFormat.format(delta.value)} {delta.period}
              </span>
            ) : null}
          </p>
        </div>
        {trend ? <Sparkline values={trend} className="h-7 w-24 shrink-0 text-[hsl(var(--chart-2))]" /> : null}
      </div>
    </Link>
  );
}
