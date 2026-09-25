import { marked, Renderer, type Tokens } from "marked";
import TurndownService from "turndown";

import { chartFigureHtml, escapeHtml, extractChartSpec, parseChartBlock } from "./chart";
import { slugify } from "./slug";

// Markdown <-> HTML conversion for the blog editor's Visual/Markdown toggle
// and for AI-generated post bodies (lib/ai/blog-generate.ts). `content`
// stays the source of truth as TipTap-compatible HTML — this matches the
// existing Post model (`content` is "Editor HTML as saved by TipTap") and
// the public renderer (lib/cms/rich-text.ts's sanitizeRich, run again on
// every save and every public read) — Markdown is only ever an edit-time
// representation, converted losslessly enough for the tag set sanitizeRich
// allows: p, br, hr, h2-h4 (with an id), ul/ol/li, strong/b, em/i, s,
// code/pre, blockquote, a, img, figure/figcaption, table/thead/tbody/tr/th/td,
// aside (a GFM alert callout) and details/summary (a chart's data table).
//
// marked + turndown were picked over TipTap's own markdown extension
// (no @tiptap/*-markdown package exists for TipTap 3 in this repo's
// dependency set): both are small, dependency-free, and run identically on
// the client (mode toggle) and the server (the AI generation route), so the
// same two functions are the single source of truth for the conversion
// instead of duplicating it per environment.

/** A fresh Renderer per call: heading-id de-duplication is per-document state, and a module-level singleton would leak it across unrelated posts converted back to back. */
function buildRenderer(): Renderer {
  const renderer = new Renderer();
  const seenIds = new Map<string, number>();

  // GFM strikethrough renders as <s> (not <del>) so the output matches both
  // what TipTap's Strike mark produces and what sanitizeRich's allowlist
  // accepts (it allows "s", not "del").
  const originalDel = renderer.del.bind(renderer);
  renderer.del = (token) => originalDel(token).replace(/^<del>/, "<s>").replace(/<\/del>$/, "</s>");

  // Every H2/H3/H4 gets a stable, unique slug id, so the public page and the
  // admin preview can both build a table of contents from the same markup
  // (lib/blog/render.ts's extractToc) without a second pass over the source.
  renderer.heading = ({ tokens, depth }: Tokens.Heading) => {
    const level = Math.min(Math.max(depth, 2), 4); // marked's H1 downgrade below only guards a literal "#"; nested depths still clamp here.
    const html = renderer.parser.parseInline(tokens);
    const text = html.replace(/<[^>]+>/g, "").trim();
    const base = slugify(text) || "section";
    const count = seenIds.get(base) ?? 0;
    seenIds.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return `<h${level} id="${id}">${html}</h${level}>\n`;
  };

  // An image with a title becomes a <figure><img><figcaption> (work item 2:
  // the AI image-token flow always supplies a caption); a bare image (no
  // title — TipTap's own image insert never sets one) stays a plain <img>.
  renderer.image = ({ href, title, text }: Tokens.Image) => {
    const safeAlt = escapeHtml(text || "");
    const safeHref = escapeHtml(href || "");
    if (!title) return `<img src="${safeHref}" alt="${safeAlt}">`;
    return `<figure><img src="${safeHref}" alt="${safeAlt}"><figcaption>${escapeHtml(title)}</figcaption></figure>`;
  };

  // Commonmark treats an image as inline, so the default paragraph renderer
  // would otherwise nest a block-level <figure> inside a <p> whenever an
  // image sits alone on its own line ("place each content image as its own
  // line" — work item 1). A paragraph containing exactly one image token
  // renders as that image alone, block-level, matching where it visually
  // ends up in the sanitized/rendered post either way.
  renderer.paragraph = ({ tokens }: Tokens.Paragraph) => {
    if (tokens.length === 1 && tokens[0].type === "image") {
      return `${renderer.image(tokens[0] as Tokens.Image)}\n`;
    }
    return `<p>${renderer.parser.parseInline(tokens)}</p>\n`;
  };

  // GFM alert callouts ("> [!NOTE]\n> text") render to <aside data-callout>
  // instead of <blockquote> — a genuine quote (no marker) is untouched.
  renderer.blockquote = ({ tokens }: Tokens.Blockquote) => {
    const inner = renderer.parser.parse(tokens);
    const markerMatch = inner.match(/^<p>\[!(NOTE|TIP|WARNING)\](?:<\/p>\s*|\s+)/);
    if (!markerMatch) return `<blockquote>\n${inner}</blockquote>\n`;
    const type = markerMatch[1].toLowerCase();
    const rest = inner.slice(markerMatch[0].length);
    const body = markerMatch[0].endsWith("</p>") || markerMatch[0].trim().endsWith("</p>") ? rest : `<p>${rest}`;
    return `<aside data-callout="${type}">\n${body}</aside>\n`;
  };

  // A ```chart fenced block is strict JSON (lib/blog/chart.ts), never
  // rendered as a code sample: valid JSON becomes the figure+table markup;
  // anything else (invalid JSON, a failed shape check) is dropped silently
  // rather than failing the whole post over one bad block.
  const originalCode = renderer.code.bind(renderer);
  renderer.code = (token: Tokens.Code) => {
    if (token.lang?.trim().toLowerCase() !== "chart") return originalCode(token);
    const spec = parseChartBlock(token.text);
    return spec ? `${chartFigureHtml(spec)}\n` : "";
  };

  // Raw HTML in the Markdown source is shown as text, never passed through.
  // Every tag this module emits comes from a renderer above, with its text
  // escaped, so model output or pasted Markdown can't smuggle markup (an
  // <img onerror>, a <script>) into the editor before the server sanitizes.
  renderer.html = ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text);

  // Table header cells get scope="col" for accessibility; the alignment
  // attribute marked would otherwise add isn't in sanitizeRich's allowlist,
  // so it's dropped here rather than silently stripped later.
  renderer.tablecell = (token: Tokens.TableCell) => {
    const content = renderer.parser.parseInline(token.tokens);
    return token.header ? `<th scope="col">${content}</th>\n` : `<td>${content}</td>\n`;
  };

  return renderer;
}

marked.setOptions({ gfm: true, breaks: false });

/**
 * Markdown to HTML for the Visual editor / live preview. A stray `#` H1 (the
 * model should never repeat the title as a heading, but nothing enforces
 * that upstream) is downgraded to H2 rather than silently dropped by
 * sanitizeRich, whose allowlist starts at H2.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return "";
  const html = marked.parse(markdown, { async: false, renderer: buildRenderer() }) as string;
  return html.replace(/<h1(\s[^>]*)?>/gi, "<h2>").replace(/<\/h1>/gi, "</h2>").trim();
}

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});

// Turndown has no built-in GFM strikethrough rule; <s> is what this editor
// and sanitizeRich's allowlist use (see the marked.Renderer override above).
turndown.addRule("strikethrough", {
  filter: (node) => ["S", "DEL", "STRIKE"].includes(node.nodeName),
  replacement: (content) => `~~${content}~~`,
});

// A chart figure round-trips to its original ```chart fenced JSON (not to a
// generic table) so re-entering Markdown mode never shows an admin a raw
// data table where they wrote a chart. Anything that fails to parse back out
// (hand-edited into an inconsistent shape) falls through to the generic
// table rule below instead of vanishing.
turndown.addRule("chartFigure", {
  filter: (node) => node.nodeName === "FIGURE" && node.getAttribute("data-chart") !== null,
  replacement: (_content, node) => {
    const spec = extractChartSpec((node as HTMLElement).outerHTML);
    if (!spec) return "";
    return `\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\`\n\n`;
  },
});

// A plain figure (an image with a caption) round-trips to
// ![alt](src "caption") — the same syntax markdownToHtml's image renderer
// turns back into a <figure> above.
turndown.addRule("imageFigure", {
  filter: (node) => node.nodeName === "FIGURE" && node.getAttribute("data-chart") === null,
  replacement: (_content, node) => {
    const img = (node as HTMLElement).querySelector("img");
    const caption = (node as HTMLElement).querySelector("figcaption");
    if (!img) return "";
    const alt = img.getAttribute("alt") || "";
    const src = img.getAttribute("src") || "";
    const title = caption?.textContent?.trim();
    return `\n\n![${alt}](${src}${title ? ` "${title}"` : ""})\n\n`;
  },
});

turndown.addRule("callout", {
  filter: (node) => node.nodeName === "ASIDE" && node.getAttribute("data-callout") !== null,
  replacement: (content, node) => {
    const type = (node as HTMLElement).getAttribute("data-callout")?.toUpperCase() || "NOTE";
    const quoted = content
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    return `\n\n> [!${type}]\n${quoted}\n\n`;
  },
});

// A minimal GFM pipe-table rule — plain "turndown" has no table support
// built in (unlike the separate turndown-plugin-gfm package, not a
// dependency here). Only ever needs to handle the shape this module itself
// produces (a header row of th, body rows of one th + td cells).
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const table = node as HTMLElement;
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return "";
    const cellText = (cell: Element) => (cell.textContent || "").trim().replace(/\|/g, "\\|") || " ";
    const lines = rows.map((row) => `| ${Array.from(row.children).map(cellText).join(" | ")} |`);
    const columnCount = rows[0].children.length;
    lines.splice(1, 0, `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`);
    return `\n\n${lines.join("\n")}\n\n`;
  },
});

/** HTML to Markdown for the Markdown editor mode. */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  return turndown.turndown(html).trim();
}
