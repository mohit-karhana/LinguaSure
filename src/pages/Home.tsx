import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { MetricBar } from "../components/MetricBar";

const METRIC_LABELS = {
  fluency: "Fluency",
  responseSpeed: "Response speed",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  clarity: "Clarity",
  tone: "Professional tone",
} as const;

export default function Home() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  if (!me) return null;

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

  return (
    <main className="stage wide">
      <p className="eyebrow">Your loop</p>
      <h1>Situation. Speak. Score. Retry.</h1>
      <p className="lede">
        These are not lessons. Pick the conversation that matters, then see
        whether the score actually moved.
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
            </p>
          </div>
          <Link to="/history">History</Link>
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
                value={me.profile.metrics?.[key as keyof typeof METRIC_LABELS] ?? 0}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <div className="section-head">
          <h2>Situations</h2>
        </div>
        <div className="chapter-grid">
          {me.chapters.map((chapter) => (
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
                {starting === chapter.id ? " · Starting…" : ""}
              </span>
            </button>
          ))}
        </div>
      </section>

      {me.recent.length > 0 ? (
        <section>
          <div className="section-head">
            <h2>Recent</h2>
          </div>
          <ul className="session-list">
            {me.recent.map((session) => (
              <li key={session.id}>
                <Link to={session.status === "scored" ? `/debrief/${session.id}` : `/practice/${session.id}`}>
                  <strong>{session.chapter.title}</strong>
                  <span>
                    {session.overall != null ? `Score ${session.overall}` : "In progress"}
                    {" · "}
                    {new Date(session.startedAt).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
