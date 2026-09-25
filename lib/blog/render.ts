import { extractChartSpec, renderChartSvg, stripTags, unescapeHtml } from "./chart";
import { slugify } from "./slug";

// Presentation-time post-processing of already-sanitized post HTML, shared
// by the public post page (app/(site)/updates/[slug]/page.tsx) and the admin
// live preview (components/admin/blog/BodyEditorCard.tsx), so both render
// from the exact same pipeline (work item 4). Both inputs have already been
// through lib/cms/rich-text.ts's sanitizeRich — this module never widens
// what tags survive, it only adds a computed <svg> next to a chart figure's
// existing <table> and reads a table of contents out of the heading ids
// lib/blog/markdown.ts already baked in. Pure and isomorphic (no
// "server-only"): the admin preview calls it in the browser.

const CHART_FIGURE_RE = /<figure data-chart="(?:bar|line|pie)">[\s\S]*?<\/figure>/g;

// A wide table scrolls inside its own focusable region instead of widening
// the page. The wrapper is added here, never stored: sanitizeRich keeps
// <table> bare, so this exact tag is the only shape it can have.
const TABLE_OPEN = '<div class="post-table" role="region" aria-label="Table" tabindex="0"><table>';

/**
 * Draws each chart figure's SVG from the numbers already in its own
 * <table data-chart>, right before the table's <details> disclosure, and
 * leaves everything else untouched. A figure whose table fails to parse (a
 * value hand-edited into something non-numeric, for instance) is left as the
 * accessible table alone — degrading to "no chart drawn", never to broken
 * markup.
 */
export function renderPostContent(html: string): string {
  if (!html) return "";
  return ensureHeadingIds(html)
    .replace(CHART_FIGURE_RE, (figureHtml) => {
      const spec = extractChartSpec(figureHtml);
      if (!spec) return figureHtml;
      const svg = renderChartSvg(spec);
      return figureHtml.includes("<details>") ? figureHtml.replace("<details>", `${svg}<details>`) : figureHtml;
    })
    .replace(/<table>/g, TABLE_OPEN)
    .replace(/<\/table>/g, "</table></div>");
}

const ANY_HEADING_RE = /<h([234])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g;
const ID_ATTR_RE = /\sid="([^"]*)"/;

/**
 * Gives every h2-h4 a unique slug id, keeping ids already there. Stored HTML
 * does not always carry them: the visual editor (TipTap) drops heading
 * attributes on save, and older posts never had any. Deriving them here
 * keeps table-of-contents links working whatever edited the post.
 */
export function ensureHeadingIds(html: string): string {
  const seen = new Set<string>();
  for (const match of html.matchAll(ANY_HEADING_RE)) {
    const existing = ID_ATTR_RE.exec(match[2])?.[1];
    if (existing) seen.add(existing);
  }
  return html.replace(ANY_HEADING_RE, (whole, level: string, attrs: string, inner: string) => {
    if (ID_ATTR_RE.test(attrs)) return whole;
    const base = slugify(unescapeHtml(stripTags(inner))) || "section";
    let id = base;
    for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
    seen.add(id);
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });
}

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

const HEADING_RE = /<h([23]) id="([^"]*)">([\s\S]*?)<\/h[23]>/g;

/** A flat table of contents from a post's own h2/h3 ids (lib/blog/markdown.ts gives every heading a unique slug id). H4 is left out — too fine-grained to navigate by. */
export function extractToc(html: string): TocItem[] {
  if (!html) return [];
  const items: TocItem[] = [];
  for (const match of html.matchAll(HEADING_RE)) {
    const id = match[2];
    const text = unescapeHtml(stripTags(match[3])).trim();
    if (!id || !text) continue;
    items.push({ id, text, level: Number(match[1]) as 2 | 3 });
  }
  return items;
}
