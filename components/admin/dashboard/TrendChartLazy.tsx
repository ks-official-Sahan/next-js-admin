"use client";

import dynamic from "next/dynamic";

import type { ComponentProps } from "react";

// Recharts only downloads on the dashboard, after the page is interactive;
// the skeleton keeps the layout still while it loads.
const TrendChart = dynamic(() => import("./TrendChart"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-hidden="true" />,
});

export default function TrendChartLazy(props: ComponentProps<typeof import("./TrendChart").default>) {
  return <TrendChart {...props} />;
}
