"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

// The server cannot know the preference, so hydration starts from "no
// preference" and React re-renders with the real value straight after. CSS
// `motion-reduce:` / `prefers-reduced-motion` rules cover that first paint.
const getServerSnapshot = () => false;

/** Live `prefers-reduced-motion: reduce`, updated when the OS setting changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
