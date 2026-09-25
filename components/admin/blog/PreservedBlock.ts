import { Node } from "@tiptap/react";

// Keeps blocks the visual editor has no schema for (tables, figures, chart
// figures, callout asides, details) exactly as they are. Without it TipTap
// parses them into plain paragraphs, and the first keystroke in Visual mode
// saves the post without its tables, charts and callouts. Each block is one
// atom node: movable and deletable as a whole, edited in Markdown mode.
//
// The captured HTML is scrubbed (no scripts, no on* handlers, no
// javascript:/data: URLs) before it is kept: pasted content lands here too.
// The server sanitizer (lib/cms/rich-text.ts) is still the security boundary.

const BLOCKED_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);
const UNSAFE_URL = /^\s*(javascript|vbscript|data):/i;

function scrub(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const node of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    if (BLOCKED_TAGS.has(node.tagName)) {
      node.remove();
      continue;
    }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || ((name === "href" || name === "src") && UNSAFE_URL.test(attr.value))) {
        node.removeAttribute(attr.name);
      }
    }
  }
  return clone.outerHTML;
}

function toElement(html: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html;
  return (template.content.firstElementChild as HTMLElement | null) ?? document.createElement("div");
}

function label(html: string): string {
  if (html.startsWith("<figure data-chart")) return "Chart";
  if (html.startsWith("<figure")) return "Figure";
  if (html.startsWith("<aside")) return "Callout";
  if (html.startsWith("<table")) return "Table";
  return "Block";
}

export const PreservedBlock = Node.create({
  name: "preservedBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      html: {
        default: "",
        parseHTML: (element: HTMLElement) => scrub(element),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    // Above the default priority (50) so a <figure> is kept whole instead of
    // the Image extension taking its <img> and dropping the caption.
    return ["figure", "aside[data-callout]", "details", "table"].map((tag) => ({ tag, priority: 60 }));
  },

  renderHTML({ node }) {
    return toElement(node.attrs.html as string);
  },

  addNodeView() {
    return ({ node }) => {
      const html = node.attrs.html as string;
      const dom = document.createElement("div");
      dom.className = "preserved-block";
      dom.contentEditable = "false";
      dom.dataset.label = `${label(html)} · edit in Markdown`;
      dom.appendChild(toElement(html));
      return { dom };
    };
  },
});
