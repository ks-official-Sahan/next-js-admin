"use client";

import { useEffect, useRef, useState } from "react";

import { useActionResult } from "./ActionForm";

/**
 * The hidden `updatedAt` of an edit form inside ActionForm, for the action's
 * optimistic-concurrency check. While the form is untouched it follows the
 * row as the page renders it, so a reorder or publish on the same row never
 * makes the next edit conflict. From the first edit it stays pinned to the
 * version those edits started from, so a re-render (another form's save on
 * the same page) can never pair unsaved fields with a newer row. A
 * successful save of this form unpins it: React resets the fields to the
 * re-rendered row.
 */
export default function VersionField({ value }: { value: string }) {
  const input = useRef<HTMLInputElement>(null);
  const result = useActionResult();
  const [pinned, setPinned] = useState<string | null>(null);
  const [seen, setSeen] = useState(result);
  if (seen !== result) {
    setSeen(result);
    if (result.ok) setPinned(null);
  }

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onInput = () => setPinned((current) => current ?? input.current?.value ?? null);
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, []);

  return <input ref={input} type="hidden" name="updatedAt" value={pinned ?? value} />;
}
