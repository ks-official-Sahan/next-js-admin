import assert from "node:assert/strict";
import { test } from "node:test";

import { chartFigureHtml, extractChartSpec, parseChartBlock, renderChartSvg } from "./chart";

const BAR_SPEC = {
  type: "bar" as const,
  title: "Signups by quarter",
  labels: ["Q1", "Q2"],
  series: [
    { name: "2024", data: [120, 150] },
    { name: "2025", data: [180, 210] },
  ],
};

// ─── parseChartBlock ────────────────────────────────────────────────────

test("parseChartBlock accepts a valid spec", () => {
  const spec = parseChartBlock(JSON.stringify(BAR_SPEC));
  assert.ok(spec);
  assert.equal(spec?.type, "bar");
  assert.equal(spec?.series.length, 2);
});

test("parseChartBlock returns null on invalid JSON, never throws", () => {
  assert.equal(parseChartBlock("{ not json"), null);
});

test("parseChartBlock returns null when a series length doesn't match labels", () => {
  const bad = { ...BAR_SPEC, series: [{ name: "2024", data: [1] }] };
  assert.equal(parseChartBlock(JSON.stringify(bad)), null);
});

test("parseChartBlock returns null for a pie chart with more than one series", () => {
  const bad = { type: "pie", labels: ["A", "B"], series: [{ name: "x", data: [1, 2] }, { name: "y", data: [3, 4] }] };
  assert.equal(parseChartBlock(JSON.stringify(bad)), null);
});

test("parseChartBlock returns null for a non-finite number", () => {
  const bad = { ...BAR_SPEC, series: [{ name: "2024", data: [Number.POSITIVE_INFINITY, 1] }] };
  // JSON.stringify turns Infinity into null, which then fails the number check.
  assert.equal(parseChartBlock(JSON.stringify(bad)), null);
});

test("parseChartBlock caps labels and series counts", () => {
  const tooManyLabels = { type: "bar", labels: Array.from({ length: 13 }, (_, i) => `L${i}`), series: [{ name: "s", data: Array.from({ length: 13 }, () => 1) }] };
  assert.equal(parseChartBlock(JSON.stringify(tooManyLabels)), null);
});

// ─── chartFigureHtml / extractChartSpec round-trip ─────────────────────

test("chartFigureHtml produces a figure with a caption, a toggle and a table", () => {
  const html = chartFigureHtml(BAR_SPEC);
  assert.match(html, /^<figure data-chart="bar">/);
  assert.match(html, /<figcaption>Signups by quarter<\/figcaption>/);
  assert.match(html, /<details><summary>View data table<\/summary>/);
  assert.match(html, /<th scope="col">Category<\/th><th scope="col">2024<\/th><th scope="col">2025<\/th>/);
  assert.match(html, /<th scope="row">Q1<\/th><td>120<\/td><td>180<\/td>/);
  assert.ok(html.endsWith("</figure>"));
});

test("chartFigureHtml escapes label and title text", () => {
  const spec = { type: "bar" as const, title: "A <script> & B", labels: ["<b>x</b>"], series: [{ name: "n", data: [1] }] };
  const html = chartFigureHtml(spec);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /A &lt;script&gt; &amp; B/);
});

test("extractChartSpec recovers the original spec from chartFigureHtml's output", () => {
  const html = chartFigureHtml(BAR_SPEC);
  const spec = extractChartSpec(html);
  assert.deepEqual(spec, BAR_SPEC);
});

test("extractChartSpec recovers a spec without a title", () => {
  const noTitle = { type: "line" as const, labels: ["A", "B", "C"], series: [{ name: "s", data: [1, 2.5, 3] }] };
  const spec = extractChartSpec(chartFigureHtml(noTitle));
  assert.deepEqual(spec, noTitle);
});

test("extractChartSpec returns null for markup it did not produce", () => {
  assert.equal(extractChartSpec("<figure data-chart=\"bar\"><p>not a chart table</p></figure>"), null);
  assert.equal(extractChartSpec("<p>not a figure</p>"), null);
});

// ─── renderChartSvg ─────────────────────────────────────────────────────

test("renderChartSvg draws a bar per series per label, plus a legend swatch per series", () => {
  const svg = renderChartSvg(BAR_SPEC);
  assert.match(svg, /^<svg /);
  // 2 labels x 2 series = 4 bars, plus one legend swatch <rect> per series (2).
  assert.equal((svg.match(/<rect/g) || []).length, 6);
  assert.ok(svg.includes('role="img"'));
  assert.ok(svg.includes("Bar chart"));
});

test("renderChartSvg draws a polyline per series for a line chart", () => {
  const spec = { type: "line" as const, labels: ["A", "B", "C"], series: [{ name: "s1", data: [1, 2, 3] }] };
  const svg = renderChartSvg(spec);
  assert.equal((svg.match(/<polyline/g) || []).length, 1);
  assert.equal((svg.match(/<circle/g) || []).length, 3);
});

test("renderChartSvg draws one wedge per label for a pie chart", () => {
  const spec = { type: "pie" as const, labels: ["A", "B", "C"], series: [{ name: "s1", data: [1, 1, 2] }] };
  const svg = renderChartSvg(spec);
  assert.equal((svg.match(/<path/g) || []).length, 3);
});

test("renderChartSvg escapes label and series-name text embedded in the SVG", () => {
  const spec = { type: "bar" as const, labels: ["<b>A</b>"], series: [{ name: "<i>S</i>", data: [1] }] };
  const svg = renderChartSvg(spec);
  assert.ok(!svg.includes("<b>A</b>"));
  assert.ok(!svg.includes("<i>S</i>"));
  assert.ok(svg.includes("&lt;b&gt;A&lt;/b&gt;")); // the axis label
  assert.ok(svg.includes("&lt;i&gt;S&lt;/i&gt;")); // the bar's <title> tooltip
});
