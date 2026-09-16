import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { api } from "../lib/api";
import { microphoneHint } from "../lib/microphone";
import type { DifficultyMode, PracticeSession } from "../lib/types";

const TURN_LABEL = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
} as const;

const MODES: DifficultyMode[] = ["gentle", "standard", "challenge"];

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function liveHint(turn: keyof typeof TURN_LABEL) {
  if (turn === "listening") return "Answer directly first, then add one detail.";
  if (turn === "thinking") return "Pause briefly, then start with the headline.";
  if (turn === "speaking") return "Listen fully. Note one keyword before you respond.";
  return "Keep your next answer under 20 seconds.";
}

function focusHint(focus: string | null) {
  if (focus === "responseSpeed") return "Drill: start answering in under 5 seconds.";
  if (focus === "fluency") return "Drill: keep each answer to 1-2 clean sentences first.";
  if (focus === "grammar") return "Drill: slow down and finish every sentence clearly.";
  if (focus === "vocabulary") return "Drill: replace vague words with concrete ones.";
  if (focus === "clarity") return "Drill: use point, reason, next step.";
  if (focus === "tone") return "Drill: stay direct, calm, and professional.";
  return null;
}

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
      onSessionUpdate={setSession}
      micHint={micHint}
      finishing={finishing}
      setFinishing={setFinishing}
    />
  );
}

function LivePractice({
  session,
  onSessionUpdate,
  micHint,
  finishing,
  setFinishing,
}: {
  session: PracticeSession;
  onSessionUpdate: (session: PracticeSession) => void;
  micHint: string | null;
  finishing: boolean;
  setFinishing: (value: boolean) => void;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const listRef = useRef<HTMLOListElement>(null);
  const scoredRef = useRef(false);
  const abandonGen = useRef(0);
  const finishRef = useRef<() => void>(() => {});
  const [modeSaving, setModeSaving] = useState(false);
  const maxMs = session.maxMs ?? 5 * 60 * 1000;
  const capMinutes = Math.round(maxMs / 60000);
  const { status, turn, muted, messages, error, remainingMs, start, stop, toggleMute } =
    useVoiceSession({
      sessionId: session.id,
      instructions: session.instructions || "",
      maxMs,
      onTimeUp: () => finishRef.current(),
    });
  const live = status === "live";
  const focus = session.focus ?? searchParams.get("focus");
  const focusMessage = focusHint(focus);
  const isDrill = session.kind === "drill";

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
    if (finishing || scoredRef.current) return;
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

  finishRef.current = () => {
    void finish();
  };

  function leave() {
    if (live && !window.confirm("Leave without scoring? The call will end.")) return;
    stop();
    void api.abandon(session.id).catch(() => {});
    navigate("/");
  }

  async function changeMode(mode: DifficultyMode) {
    if (mode === session.difficultyMode || modeSaving) return;
    setModeSaving(true);
    try {
      const { session: next } = await api.setSessionMode(session.id, mode);
      onSessionUpdate(next);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Could not change difficulty.");
    } finally {
      setModeSaving(false);
    }
  }

  return (
    <main className="stage">
      <p className="eyebrow">
        {isDrill ? "2-minute drill · " : ""}
        {session.chapter.title}
      </p>
      <button type="button" className="text-link" onClick={leave}>
        Back to home
      </button>
      <h1>{session.chapter.brief}</h1>
      <p className="lede">{session.chapter.situation}</p>

      {!live && !finishing ? (
        <div className="mode-row">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`mode-pill ${session.difficultyMode === mode ? "active" : ""}`}
              onClick={() => void changeMode(mode)}
              disabled={modeSaving}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      ) : (
        <p className="micro-note">Difficulty: {session.difficultyMode}</p>
      )}

      {focusMessage ? (
        <section className="focus-card">
          <h2>Focus</h2>
          <p>{focusMessage}</p>
        </section>
      ) : null}

      {!isDrill ? (
        <section className="practice-guide">
          <h2>Before you speak</h2>
          <ul>
            <li>Start with one clear sentence, then add details.</li>
            <li>If you freeze, say your point in simple words first.</li>
            <li>End each answer with a next step when possible.</li>
          </ul>
        </section>
      ) : null}

      <section className={`orb-wrap ${live ? `is-${turn}` : ""}`} aria-live="polite">
        <div className="orb" />
        <p className="orb-label">
          {finishing
            ? "Scoring the session…"
            : status === "connecting"
              ? "Connecting…"
              : live
                ? `${TURN_LABEL[turn]} · ${formatRemaining(remainingMs)} left`
                : `Not connected · ${capMinutes} minute cap`}
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
      {live ? <p className="turn-hint">{liveHint(turn)}</p> : null}

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
