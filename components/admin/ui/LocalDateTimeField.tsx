"use client";

import { useState } from "react";

/** A Date as a datetime-local value, in the viewer's own time zone. */
export function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The ISO instant for a datetime-local value read in the viewer's time zone, or "" when empty or invalid. */
export function localInputToIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// datetime-local carries no time zone: "10:00" means 10:00 where the admin
// is, but the server runs in UTC and would read it as 10:00 UTC. So the
// visible input is never submitted; a hidden field carries the ISO instant
// the browser computed in the admin's own zone.
export default function LocalDateTimeField({
  name,
  id,
  defaultValue,
  className,
}: {
  name: string;
  id?: string;
  /** An ISO instant, shown in the viewer's time zone. */
  defaultValue?: string | null;
  className?: string;
}) {
  const [local, setLocal] = useState(() => (defaultValue ? toLocalInputValue(new Date(defaultValue)) : ""));

  return (
    <>
      <input
        id={id}
        type="datetime-local"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        className={className}
        // The server renders this in UTC; the browser re-renders it in the
        // admin's zone, which is the value that matters.
        suppressHydrationWarning
      />
      <input type="hidden" name={name} value={localInputToIso(local)} />
    </>
  );
}
