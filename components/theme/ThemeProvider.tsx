"use client";

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

// next-themes injects an inline script that sets the theme class before paint.
// React 19 warns when a client render meets an executable <script>; the server
// copy has already run by then (the element carries suppressHydrationWarning),
// so on the client it is rendered inert.
const clientScriptProps = typeof window === "undefined" ? undefined : ({ type: "application/json" } as const);

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider scriptProps={clientScriptProps} {...props}>
      {children}
    </NextThemesProvider>
  );
}
