import "server-only";

import sanitizeHtml from "sanitize-html";

import { isSafeHref } from "./href";

// The one HTML allowlist for blog post bodies, used both when an editor saves
// a post (lib/actions/blog.ts) and again by the public loader (lib/blog/queries.ts)
// before render, so a value written before a rule tightened, or a row edited
// directly in the database, is never trusted as-is
// (design notes, Step 12, decision D12).

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "a",
  "img",
  // Structured-article tags (work item 1: tables, figures with captions,
  // callouts, a native no-JS disclosure for a chart's data table). Each is
  // the minimum needed for lib/blog/markdown.ts's output — nothing decorative.
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "figure",
  "figcaption",
  "aside",
  "details",
  "summary",
];

const ALLOWED_CALLOUTS = new Set(["note", "tip", "warning"]);
const ALLOWED_CHART_TYPES = new Set(["bar", "line", "pie"]);

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title"],
  img: ["src", "alt", "title", "width", "height"],
  h2: ["id"],
  h3: ["id"],
  h4: ["id"],
  th: ["scope", "colspan"],
  td: ["colspan"],
  // Value is checked below (exclusiveFilter), not just the attribute name:
  // an aside/figure whose marker isn't one of the known values is dropped
  // outright rather than kept with an attribute sanitizeRich can't vouch for.
  aside: ["data-callout"],
  figure: ["data-chart"],
};

const HEADING_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Keeps a heading's id only when it is slug-shaped (what lib/blog/markdown.ts
 * generates for table-of-contents anchors). Anything else is dropped, so
 * stored HTML can never plant ids like `__proto__` or names that clobber
 * window globals (DOM clobbering).
 */
function keepSlugId(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const id = attribs.id;
  const kept: sanitizeHtml.Attributes = typeof id === "string" && id.length <= 100 && HEADING_ID.test(id) ? { id } : {};
  return { tagName, attribs: kept };
}

/**
 * Sanitizes editor HTML for public rendering. Strips script tags, event
 * handler attributes, `javascript:` and other unsafe hrefs, iframes and
 * inline style, and drops any image without a safe `src` or a non-empty
 * `alt` (alt is required wherever an image is used). Anchors with an unsafe
 * `href` are unwrapped to plain text rather than dropped, so the surrounding
 * sentence still reads.
 */
export function sanitizeRich(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["https", "mailto", "tel"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      h2: keepSlugId,
      h3: keepSlugId,
      h4: keepSlugId,
      a: (_tagName, attribs) => {
        if (typeof attribs.href === "string" && isSafeHref(attribs.href)) {
          return {
            tagName: "a",
            attribs: {
              href: attribs.href,
              ...(attribs.title ? { title: attribs.title } : {}),
            },
          };
        }
        // An unsafe or missing href: keep the text, drop the link.
        return { tagName: "span", attribs: {} };
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "img") {
        const src = frame.attribs.src;
        const alt = frame.attribs.alt;
        return !src || !isSafeHref(src) || !alt || !alt.trim();
      }
      if (frame.tag === "aside") {
        return !ALLOWED_CALLOUTS.has(frame.attribs["data-callout"]);
      }
      if (frame.tag === "figure" && frame.attribs["data-chart"] !== undefined) {
        return !ALLOWED_CHART_TYPES.has(frame.attribs["data-chart"]);
      }
      return false;
    },
  }).trim();
}

/** Plain text extracted from sanitized HTML, for search and read-time. */
export function extractText(html: string): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return text.replace(/\s+/g, " ").trim();
}
