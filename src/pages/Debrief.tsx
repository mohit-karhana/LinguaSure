import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MetricBar } from "../components/MetricBar";
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

export default function Debrief() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
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
      const created = await api.createSession(session.chapter.id);
      navigate(`/practice/${created.session.id}`);
    } catch (caught) {
      setRetrying(false);
      setError(caught instanceof Error ? caught.message : "Could not retry.");
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

  return (
    <main className="stage wide">
      <p className="eyebrow">{session.chapter.title}</p>
      <h1>Score {scores.overall}</h1>
      <p className="lede weakness">{scores.weakness}</p>
      <p className="next-focus">Next: {scores.nextFocus}</p>

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
