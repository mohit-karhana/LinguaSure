import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AnalyticsReport } from "../lib/types";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const money = (value: number | null) =>
  value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(value);

export default function Analytics() {
  const [key, setKey] = useState(() => sessionStorage.getItem("analytics_key") || "");
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState<Record<string, string>>({});

  async function load(accessKey = key, period = days) {
    if (!accessKey) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.analytics(accessKey, period);
      sessionStorage.setItem("analytics_key", accessKey);
      setReport(next);
      setSpend(Object.fromEntries(next.campaigns.map((row) => [row.campaign, String(row.spend)])));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "Could not load analytics.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (key) void load(key, days);
    // Access key is intentionally read only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    await load();
  }

  async function changeDays(next: number) {
    setDays(next);
    await load(key, next);
  }

  async function saveSpend(campaign: string) {
    const amount = Number(spend[campaign]);
    try {
      await api.saveAnalyticsSpend(key, campaign, amount);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save spend.");
    }
  }

  if (!report) {
    return (
      <main className="stage analytics-page">
        <p className="eyebrow">Private dashboard</p>
        <h1>Ad funnel analytics</h1>
        <form className="analytics-unlock" onSubmit={(event) => void unlock(event)}>
          <label>
            Analytics access key
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Loading…" : "Open dashboard"}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        <Link to="/">Back to LinguaSure</Link>
      </main>
    );
  }

  const completionRate = report.totals.visitors
    ? report.totals.completions / report.totals.visitors
    : 0;

  return (
    <main className="stage wide analytics-page">
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">Instagram ad measurement</p>
          <h1>Campaign funnel</h1>
          <p className="micro-note">
            A campaign is evaluated after 100 visitors. Target: {percent(report.targetRate)} visitor-to-assessment completion.
          </p>
        </div>
        <div className="analytics-period">
          {[7, 30, 90].map((period) => (
            <button
              type="button"
              key={period}
              className={period === days ? "primary compact" : "ghost compact"}
              onClick={() => void changeDays(period)}
            >
              {period} days
            </button>
          ))}
        </div>
      </div>

      <section className="analytics-kpis">
        <article><strong>{report.totals.visitors}</strong><span>Landing visitors</span></article>
        <article><strong>{report.totals.signups}</strong><span>Signups</span></article>
        <article><strong>{report.totals.completions}</strong><span>Assessments completed</span></article>
        <article><strong>{percent(completionRate)}</strong><span>Core conversion</span></article>
        <article><strong>{money(report.totals.spend)}</strong><span>Tracked spend</span></article>
      </section>

      <section className="profile-card analytics-table-wrap">
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Visitors</th>
              <th>CTA</th>
              <th>Signups</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Completion rate</th>
              <th>Spend (INR)</th>
              <th>Cost/completion</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {report.campaigns.map((row) => (
              <tr key={`${row.campaign}:${row.source}:${row.medium}`}>
                <td><strong>{row.campaign}</strong><small>{row.source} / {row.medium}</small></td>
                <td>{row.visitors}</td>
                <td>{row.cta_clicks}</td>
                <td>{row.signups} <small>{percent(row.signupRate)}</small></td>
                <td>{row.starts}</td>
                <td>{row.completions}</td>
                <td>{percent(row.completionRate)}</td>
                <td>
                  <div className="spend-editor">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spend[row.campaign] ?? ""}
                      onChange={(event) => setSpend((current) => ({ ...current, [row.campaign]: event.target.value }))}
                    />
                    <button type="button" className="ghost compact" onClick={() => void saveSpend(row.campaign)}>Save</button>
                  </div>
                </td>
                <td>{money(row.costPerCompletion)}</td>
                <td><span className={`analytics-status is-${row.status}`}>
                  {row.status === "on_target" ? "On target" : row.status === "below_target" ? "Below target" : "Collecting data"}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.campaigns.length ? (
          <p className="empty">No visits recorded in this period yet.</p>
        ) : null}
      </section>
      {error ? <p className="error">{error}</p> : null}
      <p className="micro-note">
        Use a different <code>utm_campaign</code> for every ad set or creative you want to compare.
      </p>
    </main>
  );
}
