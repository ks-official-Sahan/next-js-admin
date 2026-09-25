import React from "react";
import { cn } from "@/lib/utils";

/**
 * One content-shaped placeholder rectangle for route loading.tsx skeletons.
 * `motion-safe:animate-pulse` (a default Tailwind variant, no config needed)
 * means the pulse only plays without prefers-reduced-motion — under reduced
 * motion the shape is still there, just static, so the page never truly has
 * no visual state while its data loads (loading.tsx renders immediately,
 * before any data fetch resolves).
 */
export default function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("motion-safe:animate-pulse rounded-xl bg-bFCARD", className)} />;
}
