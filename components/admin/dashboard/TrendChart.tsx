"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// The dashboard's daily charts (admin activity, site traffic). Loaded on its
// own (TrendChartLazy) so Recharts never sits in the shared admin bundle.
// Colors come from the theme's chart tokens, so light and dark both work; each
// caller renders a table with the same data for screen readers.

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const label = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));

type Row = { day: string } & Record<string, number | string | undefined>;

export default function TrendChart({ days, series: shown }: { days: Row[]; series: TrendSeries[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            {shown.map((series) => (
              <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={series.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
            tickFormatter={label}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <Tooltip
            labelFormatter={(value) => label(String(value))}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
            cursor={{ stroke: "hsl(var(--border))" }}
          />
          {shown.map((series) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={2}
              fill={`url(#fill-${series.key})`}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
