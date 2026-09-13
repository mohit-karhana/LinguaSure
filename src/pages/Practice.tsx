import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { api } from "../lib/api";
import { microphoneHint } from "../lib/microphone";
import type { PracticeSession } from "../lib/types";

const TURN_LABEL = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
} as const;

export default function Practice() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const micHint = microphoneHint();

  useEffect(() => {
    let cancelled = false;
    api
      .session(sessionId)
      .then(({ session: next }) => {
        if (cancelled) return;
        if (next.status === "scored") {
          navigate(`/debrief/${next.id}`, { replace: true });
          return;
        }
        if (next.status === "abandoned") {
          navigate("/", { replace: true });
          return;
        }
        setSession(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : "Session not found.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, sessionId]);

  if (loadError) {
    return (
      <main className="stage">
        <p className="error">{loadError}</p>
        <Link to="/">Back to situations</Link>
      </main>
    );
  }

  if (!session?.instructions) {
    return (
      <main className="stage">
        <p className="empty">Loading the situation…</p>
      </main>
    );
  }

  return (
    <LivePractice
      session={session}
      micHint={micHint}
      finishing={finishing}
      setFinishing={setFinishing}
    />
  );
}

function LivePractice({
  session,
  micHint,
  finishing,
  setFinishing,
}: {
  session: PracticeSession;
  micHint: string | null;
  finishing: boolean;
  setFinishing: (value: boolean) => void;
}) {
  const navigate = useNavigate();
  const listRef = useRef<HTMLOListElement>(null);
  const scoredRef = useRef(false);
  const abandonGen = useRef(0);
  const { status, turn, muted, messages, error, start, stop, toggleMute } = useVoiceSession({
    sessionId: session.id,
    instructions: session.instructions || "",
  });
  const live = status === "live";

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    const generation = ++abandonGen.current;
    return () => {
      window.setTimeout(() => {
        if (abandonGen.current !== generation || scoredRef.current) return;
        void api.abandon(session.id).catch(() => {});
      }, 400);
    };
  }, [session.id]);

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    const payload = stop();
    try {
      scoredRef.current = true;
      await api.complete(session.id, payload);
      navigate(`/debrief/${session.id}`);
    } catch (caught) {
      scoredRef.current = false;
      setFinishing(false);
      window.alert(caught instanceof Error ? caught.message : "Could not save the score.");
    }
  }

  function leave() {
    if (live && !window.confirm("Leave without scoring? The call will end.")) return;
    stop();
    void api.abandon(session.id).catch(() => {});
    navigate("/");
  }

  return (
    <main className="stage">
      <p className="eyebrow">{session.chapter.title}</p>
      <button type="button" className="text-link" onClick={leave}>
        Back to situations
      </button>
      <h1>{session.chapter.brief}</h1>
      <p className="lede">{session.chapter.situation}</p>

      <section className={`orb-wrap ${live ? `is-${turn}` : ""}`} aria-live="polite">
        <div className="orb" />
        <p className="orb-label">
          {finishing
            ? "Scoring the session…"
            : status === "connecting"
              ? "Connecting…"
              : live
                ? TURN_LABEL[turn]
                : "Not connected"}
        </p>
      </section>

      <div className="controls">
        {live ? (
          <>
            <button type="button" className="ghost" onClick={toggleMute}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" className="ghost" onClick={leave}>
              Leave
            </button>
            <button type="button" className="danger" onClick={() => void finish()}>
              End and score
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => void start()}
            disabled={status === "connecting" || Boolean(micHint) || finishing}
          >
            {status === "connecting" ? "Starting…" : "Start talking"}
          </button>
        )}
      </div>

      {micHint ? <p className="error">{micHint}</p> : null}
      {error && error !== micHint ? <p className="error">{error}</p> : null}

      <section className="transcript" aria-label="Live transcript">
        <div className="transcript-head">
          <h2>Live transcript</h2>
          <span>{live ? "Streaming" : "Idle"}</span>
        </div>
        {messages.length === 0 ? (
          <p className="empty">
            The other person will start in character. Speak as yourself. When
            you finish, we score the turn and keep the evidence.
          </p>
        ) : (
          <ol ref={listRef}>
            {messages.map((line) => (
              <li key={line.id} className={line.role}>
                <strong>{line.role === "user" ? "You" : "Them"}</strong>
                <p>{line.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
