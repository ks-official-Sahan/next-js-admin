import assert from "node:assert/strict";
import { test } from "node:test";

import { chartFigureHtml } from "./chart";
import { extractToc, renderPostContent } from "./render";

// ─── renderPostContent ──────────────────────────────────────────────────

test("renderPostContent draws an <svg> into a chart figure, ahead of its <details> data table", () => {
  const figure = chartFigureHtml({ type: "bar", labels: ["A", "B"], series: [{ name: "s", data: [1, 2] }] });
  const html = `<p>Intro</p>${figure}<p>More</p>`;
  const rendered = renderPostContent(html);
  assert.ok(rendered.includes("<svg "));
  assert.ok(rendered.indexOf("<svg ") < rendered.indexOf("<details>"));
  assert.ok(rendered.includes("<p>Intro</p>"));
  assert.ok(rendered.includes("<p>More</p>"));
});

test("renderPostContent leaves non-chart HTML untouched", () => {
  const html = "<h2 id=\"a\">A</h2><p>Body text.</p>";
  assert.equal(renderPostContent(html), html);
});

test("renderPostContent degrades to the plain table when a figure's data can't be parsed back out", () => {
  const broken = '<figure data-chart="bar"><details><summary>View data table</summary><table><thead><tr><th scope="col">Category</th></tr></thead><tbody></tbody></table></details></figure>';
  const rendered = renderPostContent(broken);
  assert.ok(!rendered.includes("<svg"));
  assert.ok(rendered.includes("<summary>View data table</summary>"));
});

test("renderPostContent adds unique slug ids to headings that have none, keeping existing ones", () => {
  const rendered = renderPostContent('<h2>Why caching</h2><h2 id="why-caching">Kept</h2><h3>Why caching</h3><h4>Deep <em>dive</em></h4>');
  assert.equal(
    rendered,
    '<h2 id="why-caching-2">Why caching</h2><h2 id="why-caching">Kept</h2><h3 id="why-caching-3">Why caching</h3><h4 id="deep-dive">Deep <em>dive</em></h4>'
  );
  assert.deepEqual(
    extractToc(rendered).map((item) => item.id),
    ["why-caching-2", "why-caching", "why-caching-3"]
  );
});

test("renderPostContent wraps every table in a focusable scroll region", () => {
  const rendered = renderPostContent("<table><tbody><tr><td>1</td></tr></tbody></table>");
  assert.equal(
    rendered,
    '<div class="post-table" role="region" aria-label="Table" tabindex="0"><table><tbody><tr><td>1</td></tr></tbody></table></div>'
  );
});

test("renderPostContent handles more than one chart figure in the same post", () => {
  const a = chartFigureHtml({ type: "bar", labels: ["A"], series: [{ name: "s", data: [1] }] });
  const b = chartFigureHtml({ type: "pie", labels: ["X", "Y"], series: [{ name: "s", data: [1, 2] }] });
  const rendered = renderPostContent(`${a}<p>between</p>${b}`);
  assert.equal((rendered.match(/<svg/g) || []).length, 2);
});

test("renderPostContent returns an empty string for empty input", () => {
  assert.equal(renderPostContent(""), "");
});

// ─── extractToc ──────────────────────────────────────────────────────────

test("extractToc reads h2/h3 ids and text, in document order", () => {
  const html = '<h2 id="intro">Intro</h2><p>x</p><h3 id="details">Details &amp; notes</h3><h2 id="end">End</h2>';
  const toc = extractToc(html);
  assert.deepEqual(toc, [
    { id: "intro", text: "Intro", level: 2 },
    { id: "details", text: "Details & notes", level: 3 },
    { id: "end", text: "End", level: 2 },
  ]);
});

test("extractToc ignores h4 and headings without an id", () => {
  const html = '<h4 id="deep">Deep</h4><h2>No id</h2><h2 id="ok">OK</h2>';
  const toc = extractToc(html);
  assert.deepEqual(toc, [{ id: "ok", text: "OK", level: 2 }]);
});

test("extractToc strips inline markup from heading text", () => {
  const html = '<h2 id="a">Some <strong>bold</strong> text</h2>';
  assert.deepEqual(extractToc(html), [{ id: "a", text: "Some bold text", level: 2 }]);
});

test("extractToc returns an empty array for empty input", () => {
  assert.deepEqual(extractToc(""), []);
});
