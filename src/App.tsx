import { useEffect, useRef } from "react";
import { useVoiceSession } from "./hooks/useVoiceSession";
import "./App.css";

const TURN_LABEL = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
} as const;

export default function App() {
  const { status, turn, muted, messages, error, start, stop, toggleMute } =
    useVoiceSession();
  const live = status === "live";
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <main className="stage">
      <header className="brand">
        <p className="eyebrow">LinguaSure</p>
        <h1>Talk live. Practise the moment that matters.</h1>
        <p className="lede">
          A realtime voice coach for interviews, standups, and the conversations
          you freeze in. Speak naturally. Interrupt anytime.
        </p>
      </header>

      <section className={`orb-wrap ${live ? `is-${turn}` : ""}`} aria-live="polite">
        <div className="orb" />
        <p className="orb-label">
          {status === "connecting"
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
            <button type="button" className="danger" onClick={stop}>
              End session
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={start}
            disabled={status === "connecting"}
          >
            {status === "connecting" ? "Starting…" : "Start talking"}
          </button>
        )}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="transcript" aria-label="Live transcript">
        <div className="transcript-head">
          <h2>Live transcript</h2>
          <span>{live ? "Streaming" : "Idle"}</span>
        </div>
        {messages.length === 0 ? (
          <p className="empty">
            Grant the microphone, then start talking. The coach will greet you
            and follow the conversation.
          </p>
        ) : (
          <ol ref={listRef}>
            {messages.map((line) => (
              <li key={line.id} className={line.role}>
                <strong>{line.role === "user" ? "You" : "Coach"}</strong>
                <p>{line.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
