// A tiny trend line drawn on the server: no chart library and no client
// JavaScript for the stat tiles. Decorative; the tile states the numbers.

export default function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const width = 96;
  const height = 28;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - 2 - (value / max) * (height - 4)] as const);
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path d={area} className="fill-current opacity-10" />
      <path d={line} className="fill-none stroke-current" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
