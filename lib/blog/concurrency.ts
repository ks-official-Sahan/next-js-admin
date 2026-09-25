// Optimistic concurrency for editing a post (design notes,
// Step 12 hardening). The edit form carries the post's `updatedAt` (ISO) in a
// hidden field; lib/actions/blog.ts's updatePostAction does a conditional
// `updateMany({ where: { id, updatedAt } })` inside its transaction, so a save
// that lands after someone else's edit changes zero rows instead of silently
// overwriting it. Pure: no database or React, so the parsing rule is unit
// tested on its own (see ./concurrency.test.ts).

/**
 * Parses the edit form's hidden `updatedAt` field. Null means the client sent
 * nothing usable (missing, empty, or not a valid date) — the caller must
 * refuse the save rather than pass `undefined`/`Invalid Date` into a Prisma
 * `where` clause.
 */
export function parseSubmittedUpdatedAt(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const UPDATE_CONFLICT_MESSAGE =
  "This post was changed elsewhere since you opened it. Reload to see the latest version; your text is kept in this form.";
