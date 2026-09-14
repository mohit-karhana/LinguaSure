import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MetricBar } from "../components/MetricBar";
import { ScoreChart } from "../components/ScoreChart";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { Goal, UnlockMetric } from "../lib/types";

const METRIC_LABELS = {
  fluency: "Fluency",
  responseSpeed: "Response speed",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  clarity: "Clarity",
  tone: "Professional tone",
} as const;

const UNLOCK_METRICS: UnlockMetric[] = [
  "fluency",
  "responseSpeed",
  "grammar",
  "vocabulary",
  "clarity",
  "tone",
  "overall",
];

function emptyThresholds(fallback = 70): Record<UnlockMetric, number> {
  return Object.fromEntries(UNLOCK_METRICS.map((metric) => [metric, fallback])) as Record<
    UnlockMetric,
    number
  >;
}

export default function Home() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [metric, setMetric] = useState<Goal["metric"]>(me?.goal.metric ?? "fluency");
  const [thresholds, setThresholds] = useState<Record<UnlockMetric, number>>(
    me?.goal.thresholds ?? emptyThresholds(me?.goal.threshold ?? 70),
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if (!me) return;
    setMetric(me.goal.metric);
    setThresholds({
      ...emptyThresholds(me.goal.threshold),
      ...me.goal.thresholds,
    });
    setAdvanced(me.goal.metric !== "fluency");
  }, [me]);

  if (!me) return null;

  const opened = me.chapters.filter((chapter) => chapter.unlocked).length;
  const moving = me.progress.filter((group) => group.points.filter((point) => point.overall != null).length >= 2);

  async function startChapter(chapterId: string) {
    setStarting(chapterId);
    setError(null);
    try {
      const { session } = await api.createSession(chapterId);
      await refresh();
      navigate(`/practice/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start.");
      setStarting(null);
    }
  }

  async function resetHistory() {
    if (
      !window.confirm(
        "Delete every session and lock situations again? Your unlock bar settings stay.",
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await api.resetHistory();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset history.");
    } finally {
      setResetting(false);
    }
  }

  async function saveGoal(event: FormEvent) {
    event.preventDefault();
    setSavingGoal(true);
    setError(null);
    try {
      const nextMetric = advanced ? metric : "fluency";
      await api.updateGoal({ metric: nextMetric, thresholds });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your bar.");
    } finally {
      setSavingGoal(false);
    }
  }

  if (me.needsAssessment) {
    return (
      <main className="stage">
        <p className="eyebrow">First session</p>
        <h1>Know where you stand.</h1>
        <p className="lede">
          One mixed 8-minute conversation. Then a profile. Then the gym. We only
          score what we can hear.
        </p>
        <div className="controls" style={{ justifyContent: "flex-start", marginTop: 28 }}>
          <button
            type="button"
            className="primary"
            onClick={() => void startChapter(me.assessment?.id || "assessment")}
            disabled={Boolean(starting)}
          >
            {starting ? "Opening…" : "Start the assessment"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="stage wide">
      <p className="eyebrow">Your loop</p>
      <h1>Situation. Speak. Score. Unlock.</h1>
      <p className="lede">
        Five core situations first. Everything else is under More situations after you finish the assessment.
      </p>

      <section className="profile-card">
        <div className="profile-head">
          <div>
            <h2>Communication profile</h2>
            <p>
              {me.profile.sessionCount
                ? `${me.profile.sessionCount} scored session${me.profile.sessionCount === 1 ? "" : "s"}`
                : "No scored sessions yet"}
              {me.profile.lastOverall != null ? ` · last ${me.profile.lastOverall}` : ""}
              {me.profile.bestOverall != null ? ` · best ${me.profile.bestOverall}` : ""}
              {` · ${opened} open`}
            </p>
          </div>
          <div className="profile-actions">
            <Link to="/history">History</Link>
            <button
              type="button"
              className="ghost compact"
              onClick={() => void resetHistory()}
              disabled={resetting || (me.profile.sessionCount === 0 && me.recent.length === 0)}
            >
              {resetting ? "Resetting…" : "Reset history"}
            </button>
          </div>
        </div>
        {me.profile.latestWeakness ? (
          <p className="weakness">{me.profile.latestWeakness}</p>
        ) : (
          <p className="empty">Your first debrief will name one specific weakness.</p>
        )}
        {me.profile.metrics ? (
          <div className="metrics">
            {Object.entries(METRIC_LABELS).map(([key, label]) => (
              <MetricBar
                key={key}
                label={label}
                value={me.profile.metrics?.[key as keyof typeof METRIC_LABELS] ?? null}
              />
            ))}
          </div>
        ) : null}
      </section>

      {moving.length > 0 ? (
        <section className="profile-card">
          <h2>Did the score move?</h2>
          <div className="chart-grid">
            {moving.map((group) => (
              <ScoreChart key={group.chapterId} group={group} metricLabel={me.goal.label} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="profile-card">
        <div className="profile-head">
          <div>
            <h2>Your unlock bar</h2>
            <p>
              Next situation opens when you hit {me.goal.threshold}{" "}
              {me.goal.label.toLowerCase()} on the current one.
            </p>
          </div>
        </div>
        <form className="goal-form stacked" onSubmit={(event) => void saveGoal(event)}>
          <label>
            Minimum {advanced ? me.metricOptions[metric].toLowerCase() : "fluency"}
            <input
              type="number"
              min={50}
              max={95}
              value={thresholds[advanced ? metric : "fluency"] ?? 70}
              onChange={(event) =>
                setThresholds((current) => ({
                  ...current,
                  [advanced ? metric : "fluency"]: Number(event.target.value),
                }))
              }
            />
          </label>
          <button
            type="button"
            className="text-link"
            onClick={() => setAdvanced((value) => !value)}
          >
            {advanced ? "Use the simple fluency bar" : "Advanced: pick another metric"}
          </button>
          {advanced ? (
            <ul className="goal-metrics">
              {Object.entries(me.metricOptions).map(([value, label]) => {
                const key = value as UnlockMetric;
                return (
                  <li key={key}>
                    <label className="goal-metric">
                      <input
                        type="radio"
                        name="unlock-metric"
                        checked={metric === key}
                        onChange={() => setMetric(key)}
                      />
                      <span>{label}</span>
                      <input
                        type="number"
                        min={50}
                        max={95}
                        value={thresholds[key] ?? 70}
                        onChange={(event) =>
                          setThresholds((current) => ({
                            ...current,
                            [key]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <button type="submit" className="primary compact" disabled={savingGoal}>
            {savingGoal ? "Saving…" : "Save bar"}
          </button>
        </form>
      </section>

      <section>
        <div className="section-head">
          <h2>Core situations</h2>
        </div>
        <div className="chapter-grid">
          {me.chapters
            .filter((chapter) => chapter.lane !== "extra")
            .map((chapter) =>
            chapter.unlocked ? (
              <button
                key={chapter.id}
                type="button"
                className="chapter-card"
                onClick={() => startChapter(chapter.id)}
                disabled={Boolean(starting)}
              >
                <strong>{chapter.title}</strong>
                <p>{chapter.situation}</p>
                <span>
                  {chapter.duration}
                  {chapter.best != null
                    ? ` · best ${chapter.best} ${me.goal.label.toLowerCase()}`
                    : " · not scored yet"}
                  {starting === chapter.id ? " · Starting…" : ""}
                </span>
              </button>
            ) : (
              <article key={chapter.id} className="chapter-card locked">
                <strong>{chapter.title}</strong>
                <p>{chapter.situation}</p>
                <span>Locked</span>
              </article>
            ),
          )}
        </div>
      </section>

      {me.chapters.some((chapter) => chapter.lane === "extra") ? (
        <section>
          <div className="section-head">
            <h2>More situations</h2>
          </div>
          <p className="lede">Open any of these after the assessment. Retry the same one to see if the score moved.</p>
          <div className="chapter-grid">
            {me.chapters
              .filter((chapter) => chapter.lane === "extra")
              .map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  className="chapter-card"
                  onClick={() => startChapter(chapter.id)}
                  disabled={Boolean(starting)}
                >
                  <strong>{chapter.title}</strong>
                  <p>{chapter.situation}</p>
                  <span>
                    {chapter.duration}
                    {chapter.best != null
                      ? ` · best ${chapter.best} ${me.goal.label.toLowerCase()}`
                      : " · not scored yet"}
                    {starting === chapter.id ? " · Starting…" : ""}
                  </span>
                </button>
              ))}
          </div>
        </section>
      ) : null}

      {me.recent.length > 0 ? (
        <section>
          <div className="section-head">
            <h2>Recent</h2>
          </div>
          <ul className="session-list">
            {me.recent.map((session) => (
              <li key={session.id}>
                {session.status === "abandoned" ? (
                  <div className="session-static">
                    <strong>{session.chapter.title}</strong>
                    <span>
                      Left without scoring
                      {" · "}
                      {new Date(session.startedAt).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <Link to={session.status === "scored" ? `/debrief/${session.id}` : `/practice/${session.id}`}>
                    <strong>{session.chapter.title}</strong>
                    <span>
                      {session.overall != null ? `Score ${session.overall}` : "In progress"}
                      {" · "}
                      {new Date(session.startedAt).toLocaleString()}
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
