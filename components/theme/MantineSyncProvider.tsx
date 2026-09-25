"use client";

import { MantineProvider } from "@mantine/core";
import { useTheme } from "next-themes";
import { theme } from "@/config/mantine-theme";
import { useState, useEffect } from "react";

/**
 * next-themes is the single source of truth for light/dark mode (it drives
 * Tailwind's `dark:` classes, which style almost the entire UI). Mantine is
 * only used for a couple of components (the mobile nav Drawer/Burger), so
 * rather than letting Mantine manage its own independent color scheme, this
 * derives it from next-themes to avoid the two systems drifting out of sync
 * (which previously caused an `<html>` hydration mismatch).
 *
 * The `mounted` guard prevents a FOUC where `resolvedTheme` is undefined on
 * the first render — without it, Mantine always starts dark regardless of the
 * user's actual preference.
 */
export function MantineSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const colorScheme = mounted && resolvedTheme === "light" ? "light" : "dark";

  return (
    <MantineProvider
      forceColorScheme={colorScheme}
      theme={theme}
    >
      {children}
    </MantineProvider>
  );
}
