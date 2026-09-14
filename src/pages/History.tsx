import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ScoreChart } from "../components/ScoreChart";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { PracticeSession, SituationProgress } from "../lib/types";

function sessionHref(session: PracticeSession) {
  if (session.status === "scored") return `/debrief/${session.id}`;
  if (session.status === "live") return `/practice/${session.id}`;
  return null;
}

function sessionLabel(session: PracticeSession) {
  if (session.status === "scored" && session.overall != null) return `Score ${session.overall}`;
  if (session.status === "abandoned") return "Left without scoring";
  return "Unfinished";
}

export default function History() {
  const { me, refresh } = useAuth();
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [progress, setProgress] = useState<SituationProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api
      .sessions()
      .then((data) => {
        setSessions(data.sessions);
        setProgress(data.progress || []);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not load history.");
      });
  }, []);

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
      setSessions([]);
      setProgress([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset history.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="stage wide">
      <p className="eyebrow">History</p>
      <h1>Did the score move?</h1>
      <p className="lede">
        Retry the same situation. The point is the delta, not a new chat.
      </p>
      {progress.some((group) => group.points.filter((point) => point.overall != null).length >= 2) ? (
        <section className="chart-grid">
          {progress.map((group) => (
            <ScoreChart
              key={group.chapterId}
              group={group}
              metricLabel={me?.goal.label || "Unlock metric"}
            />
          ))}
        </section>
      ) : null}
      <div className="section-head">
        <h2>Sessions</h2>
        <button
          type="button"
          className="ghost compact"
          onClick={() => void resetHistory()}
          disabled={resetting || sessions.length === 0}
        >
          {resetting ? "Resetting…" : "Reset history"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {sessions.length === 0 ? (
        <p className="empty">No sessions yet. Start a situation from the home page.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((session) => {
            const href = sessionHref(session);
            const body = (
              <>
                <strong>{session.chapter.title}</strong>
                <span>
                  {sessionLabel(session)}
                  {session.weakness ? ` · ${session.weakness}` : ""}
                </span>
              </>
            );
            return (
              <li key={session.id}>
                {href ? <Link to={href}>{body}</Link> : <div className="session-static">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
