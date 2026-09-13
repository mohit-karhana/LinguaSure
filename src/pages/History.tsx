import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PracticeSession } from "../lib/types";

export default function History() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .sessions()
      .then((data) => setSessions(data.sessions))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not load history.");
      });
  }, []);

  return (
    <main className="stage wide">
      <p className="eyebrow">History</p>
      <h1>Did the score move?</h1>
      <p className="lede">
        Retry the same situation. The point is the delta, not a new chat.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {sessions.length === 0 ? (
        <p className="empty">No sessions yet. Start a situation from the home page.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link to={session.status === "scored" ? `/debrief/${session.id}` : `/practice/${session.id}`}>
                <strong>{session.chapter.title}</strong>
                <span>
                  {session.overall != null ? `Score ${session.overall}` : "Unfinished"}
                  {session.weakness ? ` · ${session.weakness}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
