"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "dark", label: "Dark theme", Icon: Moon },
] as const;

const subscribe = () => () => {};

/** Light, system and dark, backed by the same next-themes provider as the public site. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The stored theme is unknown on the server, so nothing shows as selected
  // until the client has hydrated.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  return (
    <div role="group" aria-label="Theme" className="flex items-center rounded-md border border-border p-0.5">
      {options.map(({ value, label, Icon }) => {
        const selected = hydrated && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
