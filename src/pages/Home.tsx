import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MetricBar } from "../components/MetricBar";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { WeeklyReport } from "../lib/types";

const METRIC_LABELS = {
  fluency: "Fluency",
  responseSpeed: "Response speed",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  clarity: "Clarity",
  tone: "Professional tone",
} as const;

const FOCUS_OPTIONS = [
  {
    id: "interview" as const,
    title: "Interview prep",
    detail: "Interviews, your story, salary talks.",
  },
  {
    id: "workplace" as const,
    title: "Meetings & workplace",
    detail: "Standups, managers, speaking up in the room.",
  },
  {
    id: "client" as const,
    title: "Client calls",
    detail: "Explaining, recovering trust, negotiating.",
  },
];

function dayKey(dateIso: string) {
  const date = new Date(dateIso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function streakFromRecent(recent: Array<{ startedAt: string; status: string }>) {
  const scoredDays = [
    ...new Set(recent.filter((row) => row.status === "scored").map((row) => dayKey(row.startedAt))),
  ];
  if (!scoredDays.length) return 0;
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!scoredDays.includes(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function Home() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if (!me || me.needsAssessment || reportLoaded) return;
    setReportLoaded(true);
    api
      .report()
      .then(({ report: next }) => setReport(next))
      .catch(() => {});
  }, [me, reportLoaded]);

  if (!me) return null;

  const liveSession = me.recent.find((session) => session.status === "live");
  const streak = streakFromRecent(me.recent);

  async function startChapter(
    chapterId: string,
    options: { kind?: "drill"; focus?: string | null } = {},
  ) {
    setStarting(options.kind === "drill" ? `drill-${chapterId}` : chapterId);
    setError(null);
    try {
      const { session } = await api.createSession(chapterId, options);
      await refresh();
      navigate(`/practice/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start.");
      setStarting(null);
    }
  }

  async function chooseFocus(focusArea: "interview" | "workplace" | "client") {
    setChoosing(true);
    setError(null);
    try {
      await api.onboarding(focusArea);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that.");
    } finally {
      setChoosing(false);
    }
  }

  async function switchProgram(programId: string) {
    setSwitching(true);
    setError(null);
    try {
      await api.setProgram(programId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not switch programs.");
    } finally {
      setSwitching(false);
    }
  }

  // Onboarding: one question, then the assessment.
  if (me.needsAssessment) {
    if (!me.user.focusArea) {
      return (
        <main className="stage">
          <p className="eyebrow">Welcome</p>
          <h1>What do you need English for?</h1>
          <p className="lede">
            One choice. It shapes your assessment, your program, and every
            recommendation after it.
          </p>
          <div className="focus-options">
            {FOCUS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="focus-option"
                onClick={() => void chooseFocus(option.id)}
                disabled={choosing}
              >
                <strong>{option.title}</strong>
                <p>{option.detail}</p>
              </button>
            ))}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </main>
      );
    }

    return (
      <main className="stage">
        <p className="eyebrow">First session</p>
        <h1>Know where you stand.</h1>
        <p className="lede">
          One gentle 8-minute conversation. Then your Communication Score, one
          named weakness, and day 1 of{" "}
          {me.program ? `“${me.program.title}”` : "your program"}. We only score
          what we can hear.
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

  const today = me.today;
  const todayBusy = starting === today.chapterId;

  return (
    <main className="stage wide">
      {/* Block 1: Today's session */}
      <section className="today-hero">
        <p className="eyebrow">{today.reason}</p>
        <h1>{today.title}</h1>
        <div className="controls" style={{ justifyContent: "flex-start" }}>
          {liveSession ? (
            <Link className="button-link primary-link" to={`/practice/${liveSession.id}`}>
              Resume live session
            </Link>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() =>
                void startChapter(today.chapterId, {
                  kind: today.kind === "drill" ? "drill" : undefined,
                  focus: today.focus,
                })
              }
              disabled={Boolean(starting)}
            >
              {todayBusy ? "Opening…" : today.kind === "drill" ? "Start the drill" : "Start today's session"}
            </button>
          )}
          {me.drill && !liveSession && today.kind !== "drill" ? (
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void startChapter(me.drill!.chapterId, { kind: "drill", focus: me.drill!.focus })
              }
              disabled={Boolean(starting)}
            >
              {starting === `drill-${me.drill.chapterId}` ? "Opening…" : me.drill.label}
            </button>
          ) : null}
        </div>
        <p className="micro-note">
          {streak > 0
            ? `${streak}-day streak · one scored session keeps it alive.`
            : "One scored session today starts your streak."}
          {" · "}Level {me.level.label}
          {me.level.next ? ` · ${me.level.next.progress}% to ${me.level.next.label}` : ""}
        </p>
      </section>

      {/* Block 2: Your score */}
      <section className="profile-card">
        <div className="profile-head">
          <div>
            <h2>Your score</h2>
            <p>
              {me.profile.sessionCount
                ? `${me.profile.sessionCount} scored session${me.profile.sessionCount === 1 ? "" : "s"}`
                : "No scored sessions yet"}
              {me.profile.lastOverall != null ? ` · last ${me.profile.lastOverall}` : ""}
              {me.profile.bestOverall != null ? ` · best ${me.profile.bestOverall}` : ""}
            </p>
          </div>
          <div className="profile-actions">
            <Link to="/history">Trends & history</Link>
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
        {report ? (
          <div className="report-card">
            <h3>This week&apos;s coach report</h3>
            <p className="weakness">{report.headline}</p>
            {report.wins.map((win) => (
              <p key={win} className="micro-note">
                {win}
              </p>
            ))}
            <p>Next week: {report.focus}</p>
            <ol className="action-list">
              {report.plan.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="micro-note">
            Your weekly coach report appears here after your first scored session
            of the week.
          </p>
        )}
      </section>

      {/* Block 3: Your program */}
      <section className="profile-card">
        {me.program ? (
          <>
            <div className="profile-head">
              <div>
                <h2>{me.program.title}</h2>
                <p>
                  {me.program.done
                    ? `Finished — all ${me.program.totalDays} days done.`
                    : `Day ${me.program.day} of ${me.program.totalDays} · ${me.program.tagline}`}
                </p>
              </div>
            </div>
            <div className="level-track" role="img" aria-label="Program progress">
              <div
                className="level-fill"
                style={{ width: `${Math.round((me.program.completed / me.program.totalDays) * 100)}%` }}
              />
            </div>
            <ul className="program-steps">
              {me.program.steps
                .slice(Math.max(0, me.program.completed - 1), me.program.completed + 3)
                .map((step, index, visible) => (
                  <li key={`${step.chapterId}-${index}`} className={step.done ? "done" : ""}>
                    <span className="step-mark">{step.done ? "✓" : "·"}</span>
                    <span>
                      {step.title}
                      {step.kind === "drill" ? " (2 min)" : ""}
                      {!step.done && visible.findIndex((item) => !item.done) === index
                        ? " — up next"
                        : ""}
                    </span>
                  </li>
                ))}
            </ul>
            {me.program.done ? (
              <div className="controls" style={{ justifyContent: "flex-start" }}>
                {me.programs
                  .filter((program) => program.id !== me.program?.id)
                  .map((program) => (
                    <button
                      key={program.id}
                      type="button"
                      className="ghost compact"
                      onClick={() => void switchProgram(program.id)}
                      disabled={switching}
                    >
                      Start {program.title}
                    </button>
                  ))}
              </div>
            ) : (
              <details className="program-switch">
                <summary>Switch program</summary>
                <div className="controls" style={{ justifyContent: "flex-start" }}>
                  {me.programs
                    .filter((program) => program.id !== me.program?.id)
                    .map((program) => (
                      <button
                        key={program.id}
                        type="button"
                        className="ghost compact"
                        onClick={() => void switchProgram(program.id)}
                        disabled={switching}
                      >
                        {program.title} ({program.totalDays} days)
                      </button>
                    ))}
                </div>
                <p className="micro-note">Switching restarts progress at day 1.</p>
              </details>
            )}
          </>
        ) : (
          <>
            <h2>Pick a program</h2>
            <p className="micro-note">
              A fixed sequence of real situations with an end state. The coach
              picks your session each day.
            </p>
            <div className="chapter-grid">
              {me.programs.map((program) => (
                <button
                  key={program.id}
                  type="button"
                  className="chapter-card"
                  onClick={() => void switchProgram(program.id)}
                  disabled={switching}
                >
                  <strong>{program.title}</strong>
                  <p>{program.tagline}</p>
                  <span>{program.totalDays} days</span>
                </button>
              ))}
            </div>
          </>
        )}

        <button type="button" className="text-link" onClick={() => setBrowsing((value) => !value)}>
          {browsing ? "Hide the full library" : `Browse all ${me.chapters.length} situations`}
        </button>
        {browsing ? (
          <div className="chapter-grid">
            {me.chapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                className="chapter-card"
                onClick={() => void startChapter(chapter.id)}
                disabled={Boolean(starting)}
              >
                <strong>{chapter.title}</strong>
                <p>{chapter.situation}</p>
                <span>
                  {chapter.duration}
                  {chapter.best != null ? ` · best ${chapter.best}` : " · not scored yet"}
                  {starting === chapter.id ? " · Starting…" : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
