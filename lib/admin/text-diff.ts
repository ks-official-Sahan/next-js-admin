// Line diff for the revision compare view: the longest common subsequence of
// two line lists, as a list of kept, removed and added lines. Runs of kept
// lines longer than `context` on both sides are folded to one marker, so a
// long post shows only what changed. Quadratic in lines, so both sides are
// capped; a post past the cap compares its first MAX_LINES lines.

export type LineOp = { kind: "same" | "removed" | "added"; text: string } | { kind: "skip"; count: number };

const MAX_LINES = 600;

export function diffLines(before: readonly string[], after: readonly string[], context = 2): LineOp[] {
  const a = before.slice(0, MAX_LINES);
  const b = after.slice(0, MAX_LINES);
  const n = a.length;
  const m = b.length;

  // lcs[i][j]: common subsequence length of a[i..] and b[j..], in one flat array.
  const width = m + 1;
  const lcs = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const ops: Array<{ kind: "same" | "removed" | "added"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      ops.push({ kind: "removed", text: a[i++] });
    } else {
      ops.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < n) ops.push({ kind: "removed", text: a[i++] });
  while (j < m) ops.push({ kind: "added", text: b[j++] });

  return fold(ops, context);
}

/** Keeps `context` unchanged lines around each change and folds the rest of each unchanged run. */
function fold(ops: Array<{ kind: "same" | "removed" | "added"; text: string }>, context: number): LineOp[] {
  const out: LineOp[] = [];
  let start = 0;
  while (start < ops.length) {
    if (ops[start].kind !== "same") {
      out.push(ops[start++]);
      continue;
    }
    let end = start;
    while (end < ops.length && ops[end].kind === "same") end++;
    const keepHead = start === 0 ? 0 : context;
    const keepTail = end === ops.length ? 0 : context;
    if (end - start > keepHead + keepTail) {
      out.push(...ops.slice(start, start + keepHead));
      out.push({ kind: "skip", count: end - start - keepHead - keepTail });
      out.push(...ops.slice(end - keepTail, end));
    } else {
      out.push(...ops.slice(start, end));
    }
    start = end;
  }
  return out;
}
