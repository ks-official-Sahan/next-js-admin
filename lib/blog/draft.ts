// Local-draft autosave rules for the blog editor
// (components/admin/blog/BlogEditorForm.tsx). Pure: no localStorage or React,
// so the "is this draft worth offering" rule is unit tested on its own. The
// actual localStorage reads/writes live in the component, wrapped in
// try/catch there (a browser can refuse storage in private mode, with
// disabled storage, or over quota — none of that is exercised here).

/** One key per post (or "new" for the create form), so two open posts never collide. */
export function draftStorageKey(postId: string | undefined): string {
  return `admin:blog-draft:${postId ?? "new"}`;
}

/**
 * True when a locally autosaved draft is worth offering to restore: it was
 * saved after the server copy the editor loaded (`serverUpdatedAt`), or there
 * is no server copy at all (a brand-new, never-saved post — any draft is
 * worth offering). A draft whose own saved-at timestamp cannot be parsed is
 * never offered (there is nothing to compare); an unparsable
 * `serverUpdatedAt` errs toward offering the draft rather than discarding it.
 */
export function isDraftNewer(draftSavedAt: string, serverUpdatedAt: string | null): boolean {
  const saved = Date.parse(draftSavedAt);
  if (Number.isNaN(saved)) return false;
  if (!serverUpdatedAt) return true;
  const server = Date.parse(serverUpdatedAt);
  if (Number.isNaN(server)) return true;
  return saved > server;
}
