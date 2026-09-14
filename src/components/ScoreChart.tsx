import type { SituationProgress } from "../lib/types";

export function ScoreChart({
  group,
  metricLabel,
}: {
  group: SituationProgress;
  metricLabel: string;
}) {
  const points = group.points.filter((point) => point.overall != null);
  if (points.length < 2) return null;

  const width = 320;
  const height = 120;
  const pad = 16;
  const values = points.map((point) => Number(point.overall));
  const min = Math.max(0, Math.min(...values) - 8);
  const max = Math.min(100, Math.max(...values) + 8);
  const span = Math.max(1, max - min);
  const coords = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(1, values.length - 1);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return { x, y, value };
  });
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;

  return (
    <article className="score-chart">
      <div className="score-chart-head">
        <div>
          <h3>{group.title}</h3>
          <p>
            Last {points.length} overall scores
            {delta === 0 ? " · unchanged" : delta > 0 ? ` · up ${delta}` : ` · down ${Math.abs(delta)}`}
            {" · "}
            {metricLabel.toLowerCase()} last {points[points.length - 1].metric ?? "—"}
          </p>
        </div>
        <strong>{last}</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${group.title} score trend`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" />
        {coords.map((point) => (
          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="3.5" fill="currentColor" />
        ))}
      </svg>
    </article>
  );
}
