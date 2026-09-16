import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MetricBar } from "../components/MetricBar";
import { ScoreChart } from "../components/ScoreChart";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { PracticeSession } from "../lib/types";

const METRIC_LABELS = {
  fluency: "Fluency",
  responseSpeed: "Response speed",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  clarity: "Clarity",
  tone: "Professional tone",
} as const;

function buildActionPlan(scores: PracticeSession["scores"]) {
  if (!scores) return [];
  const plan: string[] = [];
  const metrics = scores.metrics;
  if ((metrics.responseSpeed ?? 0) < 70) {
    plan.push("Practice 3 headline-first answers: one sentence in under 5 seconds.");
  }
  if ((metrics.fluency ?? 0) < 70) {
    plan.push("Retry this same situation and keep each answer under 20 seconds.");
  }
  if ((metrics.grammar ?? 100) < 70) {
    plan.push("Fix two grammar examples from this transcript, then say them out loud once.");
  }
  if ((metrics.vocabulary ?? 100) < 70) {
    plan.push("Replace three vague words (good, thing, issue) with specific alternatives.");
  }
  if ((metrics.clarity ?? 100) < 70) {
    plan.push("Use this frame: point, reason, next step.");
  }
  if (!plan.length) {
    plan.push("Run one more retry and keep the same quality under time pressure.");
  }
  return plan.slice(0, 3);
}

function weakestMetric(scores: PracticeSession["scores"]) {
  if (!scores) return null;
  const ranked = Object.entries(scores.metrics)
    .filter(([, value]) => value != null)
    .sort((a, b) => (a[1] ?? 100) - (b[1] ?? 100));
  return ranked[0]?.[0] ?? null;
}

export default function Debrief() {
  const { sessionId = "" } = useParams();
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    void refresh();
    api
      .session(sessionId)
      .then(({ session: next }) => {
        if (next.status !== "scored") {
          navigate(`/practice/${next.id}`, { replace: true });
          return;
        }
        setSession(next);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Session not found.");
      });
  }, [navigate, sessionId]);

  async function retry() {
    if (!session) return;
    setRetrying(true);
    try {
      const created = await api.createSession(session.chapter.id, {
        difficultyMode: session.difficultyMode || undefined,
      });
      navigate(`/practice/${created.session.id}`);
    } catch (caught) {
      setRetrying(false);
      setError(caught instanceof Error ? caught.message : "Could not retry.");
    }
  }

  async function retryForFocus(focus: string) {
    if (!session) return;
    setRetrying(true);
    try {
      const created = await api.createSession(session.chapter.id, { kind: "drill", focus });
      navigate(`/practice/${created.session.id}`);
    } catch (caught) {
      setRetrying(false);
      setError(caught instanceof Error ? caught.message : "Could not retry.");
    }
  }

  async function startNextProgramStep() {
    const next = me?.program?.next;
    if (!next) return;
    setRetrying(true);
    try {
      const created = await api.createSession(next.chapterId, {
        kind: next.kind === "drill" ? "drill" : undefined,
        focus: next.focus,
      });
      navigate(`/practice/${created.session.id}`);
    } catch (caught) {
      setRetrying(false);
      setError(caught instanceof Error ? caught.message : "Could not start the next step.");
    }
  }

  if (error && !session) {
    return (
      <main className="stage">
        <p className="error">{error}</p>
        <Link to="/">Back</Link>
      </main>
    );
  }

  if (!session?.scores) {
    return (
      <main className="stage">
        <p className="empty">Loading the debrief…</p>
      </main>
    );
  }

  const { scores } = session;
  const trend = me?.progress.find((group) => group.chapterId === session.chapter.id);
  const actionPlan = buildActionPlan(scores);
  const weakest = weakestMetric(scores);
  const firstAttempt = trend?.points.find((point) => point.overall != null) ?? null;
  const attemptDelta =
    firstAttempt &&
    scores.overall != null &&
    firstAttempt.sessionId !== session.id &&
    firstAttempt.overall != null
      ? scores.overall - firstAttempt.overall
      : null;
  const program = me?.program && !me.program.done ? me.program : null;

  return (
    <main className="stage wide">
      <p className="eyebrow">
        {session.kind === "drill" ? "2-minute drill · " : ""}
        {session.chapter.title}
      </p>
      <h1>{scores.overall != null ? `Score ${scores.overall}` : "Not enough evidence"}</h1>
      {attemptDelta != null ? (
        <p className="micro-note">
          First attempt on this situation: {firstAttempt?.overall} on{" "}
          {new Date(firstAttempt?.at || "").toLocaleDateString()} ·{" "}
          {attemptDelta > 0
            ? `up ${attemptDelta} since then`
            : attemptDelta < 0
              ? `down ${Math.abs(attemptDelta)} since then`
              : "unchanged since then"}
        </p>
      ) : null}
      <p className="lede weakness">{scores.weakness}</p>
      <p className="next-focus">Next: {scores.nextFocus}</p>

      {program?.next ? (
        <section className="profile-card program-cta">
          <h2>{program.title}</h2>
          <p>
            Day {program.day} of {program.totalDays} · up next: {program.next.title}
            {program.next.kind === "drill" ? " (2 min)" : ""}
          </p>
          <button
            type="button"
            className="primary compact"
            onClick={() => void startNextProgramStep()}
            disabled={retrying}
          >
            {retrying ? "Opening…" : "Continue the program"}
          </button>
        </section>
      ) : null}

      <section className="profile-card">
        <h2>The six metrics</h2>
        <div className="metrics">
          {Object.entries(METRIC_LABELS).map(([key, label]) => (
            <MetricBar
              key={key}
              label={label}
              value={scores.metrics[key as keyof typeof scores.metrics]}
            />
          ))}
        </div>
        {scores.evidence && !scores.evidence.linguistic ? (
          <p className="empty">
            Grammar, vocabulary, clarity, and tone stay blank until you speak long enough
            to quote.
          </p>
        ) : null}
      </section>

      {trend ? <ScoreChart group={trend} /> : null}

      <section className="profile-card">
        <h2>Your next 15 minutes</h2>
        <ol className="action-list">
          {actionPlan.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {weakest ? (
          <div className="focus-actions">
            <button
              type="button"
              className="ghost compact"
              onClick={() => void retryForFocus(weakest)}
              disabled={retrying}
            >
              2-minute drill on{" "}
              {METRIC_LABELS[weakest as keyof typeof METRIC_LABELS]?.toLowerCase() || weakest}
            </button>
          </div>
        ) : null}
      </section>

      <section className="evidence-grid">
        <article>
          <h2>Acoustic / temporal</h2>
          <p>{scores.acoustic.speakingSpeed.note}</p>
          <p>{scores.acoustic.pauses.note}</p>
          <p>
            Fillers: {scores.acoustic.fillers.count} ({scores.acoustic.fillers.per100Words} per 100
            words)
            {scores.acoustic.fillers.examples?.length
              ? ` — ${scores.acoustic.fillers.examples.join(", ")}`
              : ""}
          </p>
        </article>
        <article>
          <h2>Linguistic</h2>
          {(scores.linguistic.grammar.examples ?? []).map((example) => (
            <p key={example}>{example}</p>
          ))}
          {(scores.linguistic.vocabulary.examples ?? []).map((example) => (
            <p key={example}>{example}</p>
          ))}
        </article>
        <article>
          <h2>Communicative</h2>
          <p>{scores.communicative.clarity.note}</p>
          <p>{scores.communicative.unexpected.note}</p>
          <p>{scores.communicative.tone.note}</p>
        </article>
      </section>

      {session.transcript.length > 0 ? (
        <section className="transcript">
          <div className="transcript-head">
            <h2>Evidence</h2>
            <span>Transcript</span>
          </div>
          <ol>
            {session.transcript.map((line) => (
              <li key={line.id} className={line.role}>
                <strong>{line.role === "user" ? "You" : "Them"}</strong>
                <p>{line.text}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="controls">
        <button type="button" className="primary" onClick={() => void retry()} disabled={retrying}>
          {retrying ? "Opening…" : "Retry this situation"}
        </button>
        <Link className="button-link" to="/history">
          History
        </Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
