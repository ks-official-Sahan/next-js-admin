import { z } from "zod";

// Chart data model for a blog post's optional ```chart fenced block (work
// item 1). The model never gets to emit SVG or a <script> tag: it emits a
// strict, capped JSON object (parsed and validated here), which
// lib/blog/markdown.ts turns into a plain, accessible <figure data-chart>
// wrapping an HTML <table> of the data — that table, not the JSON, is what
// gets stored in `content`/`contentHtml`. The visual chart itself is drawn
// later, at render time, by lib/blog/render.ts's renderPostContent(), which
// calls extractChartSpec() to read the numbers back out of that same table
// and renderChartSvg() to draw a static <svg> from them — a pure,
// server-and-client-safe function with no DOM parser and no new dependency,
// because the table's shape is one this module itself controls end to end.

export const CHART_TYPES = ["bar", "line", "pie"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

const MAX_LABELS = 12;
const MAX_SERIES = 4;

const chartSeriesSchema = z.object({
  name: z.string().trim().min(1).max(40),
  data: z.array(z.number().finite()).min(1).max(MAX_LABELS),
});

export const chartSpecSchema = z
  .object({
    type: z.enum(CHART_TYPES),
    title: z.string().trim().min(1).max(120).optional(),
    labels: z.array(z.string().trim().min(1).max(40)).min(1).max(MAX_LABELS),
    series: z.array(chartSeriesSchema).min(1).max(MAX_SERIES),
  })
  .refine((spec) => spec.series.every((series) => series.data.length === spec.labels.length), {
    message: "Each series' data array must have exactly one value per label.",
  })
  .refine((spec) => spec.type !== "pie" || spec.series.length === 1, {
    message: "A pie chart supports exactly one series.",
  });

export type ChartSpec = z.infer<typeof chartSpecSchema>;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function unescapeHtml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Plain text (already HTML-decoded) out of a fragment sanitizeRich has kept — trims incidental whitespace from multi-line source. */
function textOf(html: string): string {
  return unescapeHtml(stripTags(html)).replace(/\s+/g, " ").trim();
}

function formatChartNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

/** Safe parse of a ```chart fenced block's JSON text; null (never a throw) on any parse or shape failure so the caller can drop it and keep the rest of the post. */
export function parseChartBlock(raw: string): ChartSpec | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = chartSpecSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * A validated chart spec as the accessible, sanitizer-safe markup that is
 * actually stored: a <figure data-chart="type"> with an optional caption and
 * a real <table> of the data, collapsed behind a native <details> disclosure
 * (no JS needed) so the chart's own SVG — added later by renderPostContent —
 * reads first, with the raw numbers one click away.
 */
export function chartFigureHtml(spec: ChartSpec): string {
  const headerCells = [`<th scope="col">Category</th>`, ...spec.series.map((series) => `<th scope="col">${escapeHtml(series.name)}</th>`)].join("");
  const bodyRows = spec.labels
    .map((label, index) => {
      const cells = spec.series.map((series) => `<td>${formatChartNumber(series.data[index])}</td>`).join("");
      return `<tr><th scope="row">${escapeHtml(label)}</th>${cells}</tr>`;
    })
    .join("");
  const caption = spec.title ? `<figcaption>${escapeHtml(spec.title)}</figcaption>` : "";
  const table = `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  return `<figure data-chart="${spec.type}">${caption}<details><summary>View data table</summary>${table}</details></figure>`;
}

const FIGURE_RE = /^<figure data-chart="(bar|line|pie)">([\s\S]*)<\/figure>$/;

/**
 * The reverse of chartFigureHtml(): reads a chart figure's own table back
 * into a ChartSpec. Used both by renderPostContent() (to draw the SVG) and
 * by markdown.ts's htmlToMarkdown (to serialize a chart figure back to a
 * ```chart fenced block for the Markdown editor mode). Regex-based rather
 * than a DOM parser on purpose: this only ever reads markup this module
 * itself produced, in one fixed shape, so a small, dependency-free parser is
 * both correct and safe to run on the client.
 */
export function extractChartSpec(figureHtml: string): ChartSpec | null {
  const figureMatch = figureHtml.trim().match(FIGURE_RE);
  if (!figureMatch) return null;
  const type = figureMatch[1] as ChartType;
  const inner = figureMatch[2];

  const captionMatch = inner.match(/<figcaption>([\s\S]*?)<\/figcaption>/);
  const title = captionMatch ? textOf(captionMatch[1]) || undefined : undefined;

  const theadMatch = inner.match(/<thead>([\s\S]*?)<\/thead>/);
  const tbodyMatch = inner.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!theadMatch || !tbodyMatch) return null;

  const headerCells = [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => textOf(match[1]));
  if (headerCells.length < 2) return null;
  const seriesNames = headerCells.slice(1);

  const labels: string[] = [];
  const seriesData: number[][] = seriesNames.map(() => []);
  for (const rowMatch of tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = rowMatch[1];
    const rowHeaderMatch = row.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    if (!rowHeaderMatch) return null;
    labels.push(textOf(rowHeaderMatch[1]));

    const values = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => Number(textOf(match[1])));
    if (values.length !== seriesNames.length || values.some((value) => !Number.isFinite(value))) return null;
    values.forEach((value, index) => seriesData[index].push(value));
  }
  if (labels.length === 0) return null;

  const candidate = {
    type,
    ...(title ? { title } : {}),
    labels,
    series: seriesNames.map((name, index) => ({ name, data: seriesData[index] })),
  };
  const parsed = chartSpecSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// ─── SVG rendering (pure — numbers and pre-escaped short strings only) ─────

const SVG_WIDTH = 600;
const SVG_HEIGHT = 320;
const MARGIN = { top: 28, right: 20, bottom: 44, left: 44 };
/** Cycles through the site's existing 5-step chart palette (style/globals.css's --chart-1..5, already defined for light and dark). */
const PALETTE = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];
const seriesColor = (index: number) => `hsl(var(${PALETTE[index % PALETTE.length]}))`;

function svgTitle(spec: ChartSpec): string {
  const kind = spec.type === "pie" ? "Pie chart" : spec.type === "line" ? "Line chart" : "Bar chart";
  const label = spec.title ? `${kind}: ${spec.title}.` : `${kind}.`;
  return `${label} ${spec.labels.length} categories, ${spec.series.length} series.`;
}

/** Pie: a vertical list beside the wedges. Bar/line: one row above the plot, so it never overlaps the bars. */
function legendMarkup(spec: ChartSpec, x: number, y: number): string {
  if (spec.series.length < 2 && spec.type !== "pie") return "";
  const items = (spec.type === "pie" ? spec.labels : spec.series.map((series) => series.name)).slice(0, 8);
  let rowX = x;
  return items
    .map((label, index) => {
      const itemX = spec.type === "pie" ? x : rowX;
      const itemY = spec.type === "pie" ? y + index * 16 : y;
      // ~6px per character at font-size 10, plus swatch and gap.
      rowX += 24 + label.length * 6;
      return `<rect x="${itemX}" y="${itemY - 8}" width="9" height="9" rx="2" fill="${seriesColor(index)}"></rect><text x="${itemX + 14}" y="${itemY}" font-size="10" fill="currentColor">${escapeHtml(label)}</text>`;
    })
    .join("");
}

function renderBarOrLineChart(spec: ChartSpec): string {
  const innerW = SVG_WIDTH - MARGIN.left - MARGIN.right;
  const innerH = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;
  const allValues = spec.series.flatMap((series) => series.data);
  const max = Math.max(...allValues, 0);
  const min = Math.min(...allValues, 0);
  const span = max - min || 1;
  const yFor = (value: number) => MARGIN.top + innerH - ((value - min) / span) * innerH;
  const baseline = yFor(0);

  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const value = min + (span * i) / 3;
    const y = yFor(value);
    return `<line x1="${MARGIN.left}" y1="${y}" x2="${SVG_WIDTH - MARGIN.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.12"></line><text x="${MARGIN.left - 6}" y="${y + 3}" font-size="9" text-anchor="end" fill="currentColor" opacity="0.7">${formatChartNumber(value)}</text>`;
  }).join("");

  const categoryWidth = innerW / spec.labels.length;
  const labelsMarkup = spec.labels
    .map((label, index) => {
      const x = MARGIN.left + categoryWidth * (index + 0.5);
      return `<text x="${x}" y="${SVG_HEIGHT - MARGIN.bottom + 16}" font-size="10" text-anchor="middle" fill="currentColor">${escapeHtml(label.length > 12 ? `${label.slice(0, 11)}…` : label)}</text>`;
    })
    .join("");

  let plot: string;
  if (spec.type === "bar") {
    const groupPad = categoryWidth * 0.15;
    const barWidth = (categoryWidth - groupPad * 2) / spec.series.length;
    plot = spec.series
      .map((series, seriesIndex) =>
        series.data
          .map((value, i) => {
            const x = MARGIN.left + categoryWidth * i + groupPad + barWidth * seriesIndex;
            const y = Math.min(yFor(value), baseline);
            const height = Math.abs(yFor(value) - baseline);
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barWidth - 2, 1).toFixed(1)}" height="${Math.max(height, 0.5).toFixed(1)}" fill="${seriesColor(seriesIndex)}" rx="2"><title>${escapeHtml(series.name)}: ${formatChartNumber(value)}</title></rect>`;
          })
          .join("")
      )
      .join("");
  } else {
    plot = spec.series
      .map((series, seriesIndex) => {
        const points = series.data.map((value, i) => `${(MARGIN.left + categoryWidth * (i + 0.5)).toFixed(1)},${yFor(value).toFixed(1)}`).join(" ");
        const dots = series.data
          .map((value, i) => `<circle cx="${(MARGIN.left + categoryWidth * (i + 0.5)).toFixed(1)}" cy="${yFor(value).toFixed(1)}" r="3" fill="${seriesColor(seriesIndex)}"><title>${escapeHtml(series.name)}: ${formatChartNumber(value)}</title></circle>`)
          .join("");
        return `<polyline points="${points}" fill="none" stroke="${seriesColor(seriesIndex)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>${dots}`;
      })
      .join("");
  }

  return [
    `<line x1="${MARGIN.left}" y1="${baseline}" x2="${SVG_WIDTH - MARGIN.right}" y2="${baseline}" stroke="currentColor" stroke-opacity="0.35"></line>`,
    gridLines,
    plot,
    labelsMarkup,
    legendMarkup(spec, MARGIN.left, MARGIN.top - 14),
  ].join("");
}

function polarPoint(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function renderPieChart(spec: ChartSpec): string {
  const cx = MARGIN.left + 90;
  const cy = SVG_HEIGHT / 2;
  const r = 85;
  const data = spec.series[0].data;
  const total = data.reduce((sum, value) => sum + Math.max(value, 0), 0) || 1;

  let angle = -Math.PI / 2;
  const wedges = data
    .map((value, index) => {
      const fraction = Math.max(value, 0) / total;
      const nextAngle = angle + fraction * Math.PI * 2;
      const [x1, y1] = polarPoint(cx, cy, r, angle);
      const [x2, y2] = polarPoint(cx, cy, r, nextAngle);
      const largeArc = nextAngle - angle > Math.PI ? 1 : 0;
      const path = fraction >= 0.999 ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z` : `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
      angle = nextAngle;
      const percent = Math.round(fraction * 100);
      return `<path d="${path}" fill="${seriesColor(index)}" stroke="hsl(var(--background))" stroke-width="1.5"><title>${escapeHtml(spec.labels[index])}: ${formatChartNumber(value)} (${percent}%)</title></path>`;
    })
    .join("");

  return `${wedges}${legendMarkup(spec, cx + r + 24, cy - ((spec.labels.length - 1) * 16) / 2)}`;
}

/** Draws a small, static, accessible chart from a validated spec — a pure function of its input, safe to call on the server or in the browser. */
export function renderChartSvg(spec: ChartSpec): string {
  const body = spec.type === "pie" ? renderPieChart(spec) : renderBarOrLineChart(spec);
  return `<svg viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="${escapeHtml(svgTitle(spec))}" class="post-chart-svg">${body}</svg>`;
}
