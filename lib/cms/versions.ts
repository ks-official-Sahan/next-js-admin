// The lifecycle rules of a CMS section, without the database
// (design notes, section 7): at most one DRAFT and one PUBLISHED
// row, saving a draft creates it with the next version or updates it in place,
// and an editor that loaded an older draft gets a conflict instead of overwriting
// someone else's work. Pure, so the rules are unit tested.

export type BlockStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED";

export interface BlockMeta {
  version: number;
  status: BlockStatus;
  updatedAt: Date;
}

export const nextVersion = (rows: ReadonlyArray<Pick<BlockMeta, "version">>): number =>
  rows.reduce((max, row) => Math.max(max, row.version), 0) + 1;

export const findDraft = <T extends Pick<BlockMeta, "status">>(rows: readonly T[]): T | null =>
  rows.find((row) => row.status === "DRAFT") ?? null;

export const findPublished = <T extends Pick<BlockMeta, "status">>(rows: readonly T[]): T | null =>
  rows.find((row) => row.status === "PUBLISHED") ?? null;

/**
 * `base` is what the editor saw when it loaded: the draft's `updatedAt` as an ISO
 * string, or null when there was no draft. Any difference means someone else
 * saved, discarded or created a draft since.
 */
export function draftConflict(current: Pick<BlockMeta, "updatedAt"> | null, base: string | null): boolean {
  if (!current) return base !== null;
  if (base === null) return true;
  return current.updatedAt.toISOString() !== base;
}

export type SaveAction = "create-draft" | "update-draft" | "conflict";

export function planSave(
  rows: ReadonlyArray<Pick<BlockMeta, "status" | "updatedAt">>,
  base: string | null
): SaveAction {
  const draft = findDraft(rows);
  if (draftConflict(draft, base)) return "conflict";
  return draft ? "update-draft" : "create-draft";
}

/** Dotted path of a zod issue, `list[2].label`, for showing the message on its field. */
export function issuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((out, part) => {
    if (typeof part === "number") return `${out}[${part}]`;
    const key = String(part);
    return out ? `${out}.${key}` : key;
  }, "");
}
