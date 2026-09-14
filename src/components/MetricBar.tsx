export function MetricBar({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  const scored = value != null && Number.isFinite(value);
  return (
    <div className={`metric ${scored ? "" : "is-empty"}`}>
      <div>
        <span>{label}</span>
        <strong>{scored ? value : "—"}</strong>
      </div>
      <div className="metric-track">
        <div
          className="metric-fill"
          style={{ width: scored ? `${Math.max(0, Math.min(100, value))}%` : "0%" }}
        />
      </div>
      {scored ? null : <p className="metric-empty">Not enough evidence</p>}
    </div>
  );
}
