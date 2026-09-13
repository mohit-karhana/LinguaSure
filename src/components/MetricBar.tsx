export function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="metric-track">
        <div className="metric-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
