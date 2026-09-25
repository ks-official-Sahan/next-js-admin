/**
 * A link a visitor may follow: a path on this site, an anchor, or an https,
 * mailto or tel URL. Everything else (javascript:, data:, protocol-relative
 * URLs, control characters) is refused. No imports, so the editor in the browser
 * and the zod schemas use the same rule.
 */
const hasUnsafeCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    // Control characters, DEL, and any whitespace.
    if (code <= 31 || code === 127) return true;
  }
  return /\s/.test(value);
};

export function isSafeHref(value: string): boolean {
  if (value.length === 0 || value.length > 500) return false;
  if (hasUnsafeCharacter(value)) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  if (value.startsWith("/") || value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:";
  } catch {
    return false;
  }
}
