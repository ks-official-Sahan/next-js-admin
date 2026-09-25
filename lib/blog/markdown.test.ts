import assert from "node:assert/strict";
import { test } from "node:test";

import { htmlToMarkdown, markdownToHtml } from "./markdown";

test("markdownToHtml renders headings with a stable slug id, lists and emphasis", () => {
  const html = markdownToHtml("## Heading\n\nSome **bold** and _italic_ text.\n\n- one\n- two\n");
  assert.match(html, /<h2 id="heading">Heading<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
});

test("markdownToHtml downgrades a stray H1 to H2 instead of losing it", () => {
  const html = markdownToHtml("# Should not be H1\n\nbody");
  assert.ok(!/<h1/i.test(html));
  assert.match(html, /<h2 id="should-not-be-h1">Should not be H1<\/h2>/);
});

test("markdownToHtml de-duplicates repeated heading text into distinct ids", () => {
  const html = markdownToHtml("## Overview\n\nfirst\n\n## Overview\n\nsecond");
  assert.match(html, /<h2 id="overview">Overview<\/h2>/);
  assert.match(html, /<h2 id="overview-2">Overview<\/h2>/);
});

test("markdownToHtml renders an image with a caption as a figure/figcaption", () => {
  const html = markdownToHtml('![a skyline at dusk](https://example.com/x.png "City skyline")');
  assert.match(html, /^<figure><img src="https:\/\/example\.com\/x\.png" alt="a skyline at dusk"><figcaption>City skyline<\/figcaption><\/figure>/);
});

test("markdownToHtml renders an image without a caption as a plain img, not wrapped in a <p>", () => {
  const html = markdownToHtml("![alt text](https://example.com/x.png)");
  assert.equal(html, '<img src="https://example.com/x.png" alt="alt text">');
});

test("markdownToHtml renders strikethrough as <s>, not <del>, to match sanitizeRich's allowlist", () => {
  const html = markdownToHtml("~~gone~~");
  assert.match(html, /<s>gone<\/s>/);
  assert.ok(!html.includes("<del>"));
});

test("markdownToHtml renders fenced code blocks as pre>code", () => {
  const html = markdownToHtml("```\nconst x = 1;\n```");
  assert.match(html, /<pre><code[^>]*>const x = 1;\n<\/code><\/pre>/);
});

test("markdownToHtml renders a GFM table with scoped header cells", () => {
  const html = markdownToHtml("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
  assert.match(html, /<table>/);
  assert.match(html, /<th scope="col">A<\/th>/);
  assert.match(html, /<th scope="col">B<\/th>/);
  assert.match(html, /<td>1<\/td>\s*<td>2<\/td>/);
  assert.ok(!html.includes("align="));
});

test("markdownToHtml renders a GFM alert callout as <aside data-callout>", () => {
  const html = markdownToHtml("> [!TIP]\n> Keep it short.");
  assert.match(html, /<aside data-callout="tip">\s*<p>Keep it short\.<\/p>\s*<\/aside>/);
  assert.ok(!html.includes("<blockquote"));
});

test("markdownToHtml renders a genuine blockquote (no alert marker) unchanged", () => {
  const html = markdownToHtml("> A quote worth keeping.");
  assert.match(html, /<blockquote>\s*<p>A quote worth keeping\.<\/p>\s*<\/blockquote>/);
});

test("markdownToHtml converts a valid ```chart fenced block into a chart figure", () => {
  const chart = JSON.stringify({ type: "bar", title: "Usage", labels: ["A", "B"], series: [{ name: "s", data: [1, 2] }] });
  const html = markdownToHtml(`\`\`\`chart\n${chart}\n\`\`\``);
  assert.match(html, /<figure data-chart="bar">/);
  assert.match(html, /<figcaption>Usage<\/figcaption>/);
  assert.ok(!html.includes("<pre>"));
});

test("markdownToHtml silently drops an invalid ```chart block instead of failing", () => {
  const html = markdownToHtml("Before\n\n```chart\nnot json\n```\n\nAfter");
  assert.ok(!html.includes("data-chart"));
  assert.match(html, /Before/);
  assert.match(html, /After/);
});

test("htmlToMarkdown round-trips headings, links and images", () => {
  const html = '<h2 id="title">Title</h2><p>Read <a href="https://example.com">this</a>.</p><figure><img src="https://example.com/x.png" alt="alt text"><figcaption>a caption</figcaption></figure>';
  const md = htmlToMarkdown(html);
  assert.match(md, /^## Title/m);
  assert.match(md, /\[this\]\(https:\/\/example\.com\)/);
  assert.match(md, /!\[alt text\]\(https:\/\/example\.com\/x\.png "a caption"\)/);
});

test("htmlToMarkdown renders <s> as GFM strikethrough", () => {
  const md = htmlToMarkdown("<p><s>gone</s></p>");
  assert.match(md, /~~gone~~/);
});

test("htmlToMarkdown renders an aside callout back to a GFM alert blockquote", () => {
  const md = htmlToMarkdown('<aside data-callout="warning"><p>Be careful.</p></aside>');
  assert.match(md, /> \[!WARNING\]/);
  assert.match(md, /> Be careful\./);
});

test("htmlToMarkdown renders a chart figure back to its original ```chart JSON", () => {
  const html = markdownToHtml('```chart\n{"type":"line","labels":["A","B"],"series":[{"name":"s","data":[1,2]}]}\n```');
  const md = htmlToMarkdown(html);
  assert.match(md, /```chart/);
  const jsonMatch = md.match(/```chart\n([\s\S]*?)\n```/);
  assert.ok(jsonMatch);
  const spec = JSON.parse(jsonMatch![1]);
  assert.equal(spec.type, "line");
  assert.deepEqual(spec.labels, ["A", "B"]);
});

test("markdownToHtml and htmlToMarkdown round-trip a full post body", () => {
  const markdown = [
    "## Section one",
    "",
    "An intro paragraph with **bold** and a [link](https://example.com).",
    "",
    "- first point",
    "- second point",
    "",
    "> A quote worth keeping.",
    "",
    "### Section two",
    "",
    '![a diagram](https://example.com/diagram.png "Diagram caption")',
  ].join("\n");

  const html = markdownToHtml(markdown);
  const roundTripped = htmlToMarkdown(html);
  const roundTrippedHtml = markdownToHtml(roundTripped);

  // Not byte-identical (Markdown has more than one valid rendering of the
  // same HTML), but stable under a second pass: converting the round-tripped
  // Markdown back to HTML must reproduce the same HTML (heading ids
  // regenerate deterministically from the same text), and the content itself
  // (headings, link, list items, quote, image) must survive.
  assert.equal(roundTrippedHtml, html);
  assert.match(html, /<h2 id="section-one">Section one<\/h2>/);
  assert.match(html, /<h3 id="section-two">Section two<\/h3>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<figure><img src="https:\/\/example\.com\/diagram\.png" alt="a diagram"><figcaption>Diagram caption<\/figcaption><\/figure>/);
});

test("empty input converts to an empty string in both directions", () => {
  assert.equal(markdownToHtml(""), "");
  assert.equal(markdownToHtml("   "), "");
  assert.equal(htmlToMarkdown(""), "");
  assert.equal(htmlToMarkdown("   "), "");
});
