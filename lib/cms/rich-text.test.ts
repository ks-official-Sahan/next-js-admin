import assert from "node:assert/strict";
import { test } from "node:test";

import { extractText, sanitizeRich } from "./rich-text";

test("strips script tags entirely", () => {
  const out = sanitizeRich('<p>Hello</p><script>alert(1)</script><p>World</p>');
  assert.ok(!out.includes("<script"));
  assert.ok(!out.includes("alert(1)"));
  assert.ok(out.includes("<p>Hello</p>"));
  assert.ok(out.includes("<p>World</p>"));
});

test("strips event handler attributes", () => {
  const out = sanitizeRich('<p onclick="alert(1)">Hi</p>');
  assert.ok(!out.includes("onclick"));
  assert.ok(!out.includes("alert(1)"));
  assert.ok(out.includes("<p>Hi</p>"));
});

test("javascript: hrefs are neutralized, the link text survives as plain text", () => {
  const out = sanitizeRich('<p><a href="javascript:alert(1)">click me</a></p>');
  assert.ok(!out.includes("javascript:"));
  assert.ok(!out.includes("<a "));
  assert.ok(out.includes("click me"));
});

test("iframe and style tags are removed", () => {
  const out = sanitizeRich('<iframe src="https://evil.example"></iframe><style>body{display:none}</style><p>ok</p>');
  assert.ok(!out.includes("<iframe"));
  assert.ok(!out.includes("<style"));
  assert.ok(out.includes("<p>ok</p>"));
});

test("inline style attributes are stripped", () => {
  const out = sanitizeRich('<p style="background:url(javascript:alert(1))">Hi</p>');
  assert.ok(!out.includes("style="));
});

test("images without alt text are dropped entirely", () => {
  const out = sanitizeRich('<p>Before</p><img src="https://example.com/a.png"><p>After</p>');
  assert.ok(!out.includes("<img"));
  assert.ok(out.includes("<p>Before</p>"));
  assert.ok(out.includes("<p>After</p>"));
});

test("images with an unsafe src are dropped even with alt text", () => {
  const out = sanitizeRich('<img src="javascript:alert(1)" alt="a picture">');
  assert.ok(!out.includes("<img"));
});

test("images with a safe https src and alt text are kept", () => {
  const out = sanitizeRich('<img src="https://example.com/a.png" alt="a picture">');
  assert.ok(out.includes('src="https://example.com/a.png"'));
  assert.ok(out.includes('alt="a picture"'));
});

test("basic formatting survives: headings, lists, links, bold, italic, code, blockquote", () => {
  const html = [
    "<h2>Heading</h2>",
    "<p>Some <strong>bold</strong> and <em>italic</em> and <code>code</code>.</p>",
    "<ul><li>one</li><li>two</li></ul>",
    "<ol><li>first</li></ol>",
    '<a href="https://example.com">a safe link</a>',
    "<blockquote>a quote</blockquote>",
  ].join("");
  const out = sanitizeRich(html);
  assert.ok(out.includes("<h2>Heading</h2>"));
  assert.ok(out.includes("<strong>bold</strong>"));
  assert.ok(out.includes("<em>italic</em>"));
  assert.ok(out.includes("<code>code</code>"));
  assert.ok(out.includes("<li>one</li>"));
  assert.ok(out.includes("<li>first</li>"));
  assert.ok(out.includes('<a href="https://example.com">a safe link</a>'));
  assert.ok(out.includes("<blockquote>a quote</blockquote>"));
});

test("mailto and tel links are kept, protocol-relative and data URLs are not", () => {
  const out = sanitizeRich(
    '<a href="mailto:a@b.com">mail</a><a href="tel:+123">call</a><a href="//evil.example">rel</a><a href="data:text/html,x">data</a>'
  );
  assert.ok(out.includes('href="mailto:a@b.com"'));
  assert.ok(out.includes('href="tel:+123"'));
  assert.ok(!out.includes("//evil.example"));
  assert.ok(!out.includes("data:text/html"));
});

test("re-sanitizing an already-sanitized value is idempotent", () => {
  const once = sanitizeRich('<p>Hi</p><script>bad()</script><img src="https://x.com/a.png" alt="a">');
  const twice = sanitizeRich(once);
  assert.equal(once, twice);
});

test("extractText strips all tags and collapses whitespace", () => {
  assert.equal(extractText("<p>Hello   <strong>World</strong></p>\n<p>Again</p>"), "Hello World Again");
});

// ─── Structured-article tags (work item 1) ─────────────────────────────

test("tables survive with scope and colspan, but not an alignment attribute", () => {
  const html = '<table><thead><tr><th scope="col" colspan="2">Header</th></tr></thead><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>';
  const out = sanitizeRich(html);
  assert.ok(out.includes('<table><thead><tr><th scope="col" colspan="2">Header</th></tr></thead><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>'));
});

test("a table header's align attribute is stripped (not in the allowlist)", () => {
  const out = sanitizeRich('<table><thead><tr><th align="right">H</th></tr></thead></table>');
  assert.ok(!out.includes("align="));
  assert.ok(out.includes("<th>H</th>"));
});

test("heading ids survive for table-of-contents anchors", () => {
  const out = sanitizeRich('<h2 id="intro">Intro</h2><h3 id="details">Details</h3>');
  assert.ok(out.includes('<h2 id="intro">Intro</h2>'));
  assert.ok(out.includes('<h3 id="details">Details</h3>'));
});

test("heading ids that are not slug-shaped are dropped, the heading kept", () => {
  assert.equal(sanitizeRich('<h2 id="__proto__">A</h2>'), "<h2>A</h2>");
  assert.equal(sanitizeRich('<h3 id="Bad Id">B</h3>'), "<h3>B</h3>");
  assert.equal(sanitizeRich('<h4 id="x" class="y">C</h4>'), '<h4 id="x">C</h4>');
});

test("a figure with an img and figcaption survives", () => {
  const html = '<figure><img src="https://example.com/a.png" alt="a photo"><figcaption>A caption</figcaption></figure>';
  const out = sanitizeRich(html);
  // sanitize-html serializes the void <img> element self-closed.
  assert.equal(out, '<figure><img src="https://example.com/a.png" alt="a photo" /><figcaption>A caption</figcaption></figure>');
});

test("an aside with a known data-callout value survives", () => {
  for (const type of ["note", "tip", "warning"]) {
    const html = `<aside data-callout="${type}"><p>Text.</p></aside>`;
    assert.equal(sanitizeRich(html), html);
  }
});

test("an aside with an unknown or missing data-callout value is dropped entirely", () => {
  assert.equal(sanitizeRich('<aside data-callout="danger"><p>Text.</p></aside>'), "");
  assert.equal(sanitizeRich("<aside><p>Text.</p></aside>"), "");
});

test("a chart figure with a known data-chart value survives, table and details included", () => {
  const html = '<figure data-chart="bar"><figcaption>Title</figcaption><details><summary>View data table</summary><table><thead><tr><th scope="col">Category</th><th scope="col">S</th></tr></thead><tbody><tr><th scope="row">A</th><td>1</td></tr></tbody></table></details></figure>';
  assert.equal(sanitizeRich(html), html);
});

test("a figure with an unknown data-chart value is dropped entirely", () => {
  assert.equal(sanitizeRich('<figure data-chart="scatter"><p>x</p></figure>'), "");
});

test("details/summary survive as a native no-JS disclosure", () => {
  const html = "<details><summary>View data table</summary><p>Hidden until opened.</p></details>";
  assert.equal(sanitizeRich(html), html);
});

test("a script tag inside a table cell is stripped, the row survives", () => {
  const out = sanitizeRich('<table><tbody><tr><td>Safe<script>alert(1)</script></td></tr></tbody></table>');
  assert.ok(!out.includes("<script"));
  assert.ok(out.includes("<td>Safe</td>"));
});
