// Before and after of an audit row as a list of changed fields. Both sides were
// redacted when the row was written, so nothing here can show a secret. Arrays
// are compared by index, and very deep or very long values are cut, because the
// audit screen only needs to show what changed
// (design notes, step 8).

export type DiffKind = "added" | "removed" | "changed";

export interface DiffRow {
  path: string;
  kind: DiffKind;
  before?: string;
  after?: string;
}

const MAX_DEPTH = 6;
const MAX_ROWS = 200;
const MAX_TEXT = 300;

function flatten(value: unknown, path: string, depth: number, out: Map<string, string>): void {
  if (value !== null && typeof value === "object" && depth < MAX_DEPTH) {
    const entries = Array.isArray(value)
      ? value.map((item, index): [string, unknown] => [`${path}[${index}]`, item])
      : Object.entries(value as Record<string, unknown>).map(([key, item]): [string, unknown] => [
          path ? `${path}.${key}` : key,
          item,
        ]);
    if (entries.length === 0) out.set(path || "(value)", Array.isArray(value) ? "[]" : "{}");
    for (const [key, item] of entries) flatten(item, key, depth + 1, out);
    return;
  }
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  out.set(path || "(value)", text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text);
}

export function diffValues(before: unknown, after: unknown): DiffRow[] {
  const left = new Map<string, string>();
  const right = new Map<string, string>();
  if (before !== null && before !== undefined) flatten(before, "", 0, left);
  if (after !== null && after !== undefined) flatten(after, "", 0, right);

  const rows: DiffRow[] = [];
  for (const path of new Set([...left.keys(), ...right.keys()])) {
    const was = left.get(path);
    const now = right.get(path);
    if (was === now) continue;
    if (was === undefined) rows.push({ path, kind: "added", after: now });
    else if (now === undefined) rows.push({ path, kind: "removed", before: was });
    else rows.push({ path, kind: "changed", before: was, after: now });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path)).slice(0, MAX_ROWS);
}
