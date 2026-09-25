// Shape of what every admin form action returns, so one client component
// (components/admin/ui/ActionForm) can show the result of any of them. Plain
// module, not "use server": types and helpers are shared with client code.

export interface ActionState {
  ok: boolean;
  /** Shown as a success toast. */
  message: string | null;
  /** Shown as an error toast and under the form. */
  error: string | null;
  /** Per field messages, keyed by input name. */
  fieldErrors?: Record<string, string>;
  /** Set by the first step of a two step action (a code was emailed). */
  challengeId?: string;
  /**
   * ISO `updatedAt` after a successful save that carries a fresh version
   * forward (lib/actions/blog.ts's updatePostAction, for optimistic
   * concurrency) — so the form's hidden field can be re-armed without a
   * reload, and a second save right after the first does not falsely
   * conflict with itself.
   */
  updatedAt?: string;
}

export const idleState: ActionState = { ok: false, message: null, error: null };

export const done = (message: string, extra: { challengeId?: string } = {}): ActionState => ({
  ok: true,
  message,
  error: null,
  ...extra,
});

export const fail = (error: string, fieldErrors?: Record<string, string>): ActionState => ({
  ok: false,
  message: null,
  error,
  ...(fieldErrors ? { fieldErrors } : {}),
});

/** First message per top-level field from a zod error. */
export function fieldErrorsFrom(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Text fields of a form as a plain object. Files and repeated fields are ignored. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}
