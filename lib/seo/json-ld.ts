// Shared serializer for every JSON-LD <script> tag. Escapes the characters
// that can end or confuse an inline script ("<", ">", "&" and the U+2028/2029
// line separators) as JSON unicode escapes, so injected content (titles,
// descriptions, question text, ...) can never close the surrounding <script>
// tag early and break out into HTML. JSON parsers read the escapes back as
// the original characters, so the structured data is unchanged. Every JSON-LD
// component routes through this one function instead of repeating the pattern.

// Built from char codes: a literal U+2028/2029 inside a regex literal is a
// line terminator and would end the literal early.
const UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, "g");

function escapeChar(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
}

export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, escapeChar);
}
