import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { createCoach } from "../lib/coach";
import { getMicrophoneStream } from "../lib/microphone";
import { historyToTranscript } from "../lib/transcript";
import type { SessionTimings, TranscriptLine } from "../lib/types";

export type SessionStatus = "idle" | "connecting" | "live" | "error";
export type TurnState = "idle" | "listening" | "thinking" | "speaking";

type TransportEvent = {
  type?: string;
};

const TURN_DETECTION = {
  type: "server_vad" as const,
  threshold: 0.72,
  prefixPaddingMs: 250,
  silenceDurationMs: 900,
  createResponse: true,
  interruptResponse: false,
};

function formatSessionError(sessionError: unknown): string {
  if (typeof sessionError === "string") return sessionError;
  if (sessionError instanceof Error) return sessionError.message;
  if (
    typeof sessionError === "object" &&
    sessionError &&
    "error" in sessionError &&
    typeof sessionError.error === "object" &&
    sessionError.error &&
    "message" in sessionError.error &&
    typeof sessionError.error.message === "string"
  ) {
    return sessionError.error.message;
  }
  if (
    typeof sessionError === "object" &&
    sessionError &&
    "message" in sessionError &&
    typeof sessionError.message === "string"
  ) {
    return sessionError.message;
  }
  return "The live session hit an error.";
}

export function useVoiceSession(options: {
  sessionId: string;
  instructions: string;
  maxMs?: number;
  onTimeUp?: () => void;
}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const messagesRef = useRef<TranscriptLine[]>([]);
  const speakingMsRef = useRef(0);
  const speakingStartedRef = useRef<number | null>(null);
  const lastCoachDoneRef = useRef<number | null>(null);
  const latenciesRef = useRef<number[]>([]);
  const userMutedRef = useRef(false);
  const aiSpeakingRef = useRef(false);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [turn, setTurn] = useState<TurnState>("idle");
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(options.maxMs ?? 8 * 60 * 1000);
  const onTimeUpRef = useRef(options.onTimeUp);
  const capTimerRef = useRef<number | null>(null);
  const capTickRef = useRef<number | null>(null);
  onTimeUpRef.current = options.onTimeUp;

  const snapshot = useCallback(() => {
    if (speakingStartedRef.current) {
      speakingMsRef.current += Date.now() - speakingStartedRef.current;
      speakingStartedRef.current = null;
    }
    return {
      transcript: messagesRef.current,
      timings: {
        speakingMs: speakingMsRef.current,
        latenciesMs: [...latenciesRef.current],
      } satisfies SessionTimings,
    };
  }, []);

  const closeHardware = useCallback(() => {
    generationRef.current += 1;
    if (capTimerRef.current) window.clearTimeout(capTimerRef.current);
    if (capTickRef.current) window.clearInterval(capTickRef.current);
    capTimerRef.current = null;
    capTickRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      // Already closed.
    }
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    closeHardware();
    userMutedRef.current = false;
    aiSpeakingRef.current = false;
    setTurn("idle");
    setMuted(false);
  }, [closeHardware]);

  const applyMuteState = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.mute(userMutedRef.current || aiSpeakingRef.current);
  }, []);

  useEffect(() => {
    const hangUp = () => closeHardware();
    window.addEventListener("pagehide", hangUp);
    return () => {
      window.removeEventListener("pagehide", hangUp);
      hangUp();
    };
  }, [closeHardware]);

  const start = useCallback(async () => {
    if (status === "connecting" || status === "live") return;

    setError(null);
    setMessages([]);
    messagesRef.current = [];
    speakingMsRef.current = 0;
    speakingStartedRef.current = null;
    lastCoachDoneRef.current = null;
    latenciesRef.current = [];
    userMutedRef.current = false;
    aiSpeakingRef.current = false;
    setMuted(false);
    setStatus("connecting");
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    try {
      const mediaStream = await getMicrophoneStream();
      if (generation !== generationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const { value: apiKey, remainingMs: serverRemaining } = await api.token(options.sessionId);
      setRemainingMs(serverRemaining ?? options.maxMs ?? 8 * 60 * 1000);
      if (generation !== generationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = mediaStream;

      const session = new RealtimeSession(createCoach(options.instructions), {
        model: "gpt-realtime-2.1",
        transport: new OpenAIRealtimeWebRTC({ mediaStream }),
        config: {
          audio: {
            input: {
              noiseReduction: { type: "far_field" },
              transcription: { model: "gpt-4o-mini-transcribe" },
              turnDetection: TURN_DETECTION,
            },
          },
        },
      });

      session.on("history_updated", (history: RealtimeItem[]) => {
        const next = historyToTranscript(history);
        messagesRef.current = next;
        setMessages(next);
      });

      session.on("audio_start", () => {
        aiSpeakingRef.current = true;
        applyMuteState();
        setTurn("speaking");
      });
      session.on("audio_stopped", () => {
        aiSpeakingRef.current = false;
        applyMuteState();
        lastCoachDoneRef.current = Date.now();
        setTurn("idle");
      });
      session.on("audio_interrupted", () => {
        aiSpeakingRef.current = false;
        applyMuteState();
        setTurn("listening");
      });

      session.on("error", (event: { error?: unknown } | unknown) => {
        const sessionError =
          typeof event === "object" && event && "error" in event
            ? (event as { error?: unknown }).error
            : event;
        console.error("Realtime session error", sessionError);
        setError(formatSessionError(sessionError));
        setStatus("error");
        teardown();
      });

      session.on("transport_event", (event: TransportEvent) => {
        const now = Date.now();
        if (event.type === "input_audio_buffer.speech_started") {
          if (lastCoachDoneRef.current) {
            latenciesRef.current.push(now - lastCoachDoneRef.current);
            lastCoachDoneRef.current = null;
          }
          speakingStartedRef.current = now;
          setTurn("listening");
        } else if (event.type === "input_audio_buffer.speech_stopped") {
          if (speakingStartedRef.current) {
            speakingMsRef.current += now - speakingStartedRef.current;
            speakingStartedRef.current = null;
          }
          setTurn("thinking");
        }
      });

      await session.connect({ apiKey });
      if (generation !== generationRef.current) {
        session.close();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      session.transport.sendEvent({ type: "response.create" });

      sessionRef.current = session;
      applyMuteState();
      setStatus("live");
      setTurn("thinking");
      const capFrom = Date.now();
      const budget = serverRemaining ?? options.maxMs ?? 8 * 60 * 1000;
      capTimerRef.current = window.setTimeout(() => {
        if (generation !== generationRef.current) return;
        onTimeUpRef.current?.();
      }, budget);
      capTickRef.current = window.setInterval(() => {
        if (generation !== generationRef.current) return;
        setRemainingMs(Math.max(0, budget - (Date.now() - capFrom)));
      }, 250);
    } catch (caught) {
      teardown();
      const message =
        caught instanceof Error ? caught.message : "Could not start talking.";
      setError(message);
      setStatus("error");
    }
  }, [applyMuteState, options.instructions, options.maxMs, options.sessionId, status, teardown]);

  const stop = useCallback(() => {
    const result = snapshot();
    teardown();
    setStatus("idle");
    return result;
  }, [snapshot, teardown]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session || status !== "live") return;

    userMutedRef.current = !userMutedRef.current;
    setMuted(userMutedRef.current);
    applyMuteState();
  }, [applyMuteState, status]);

  return {
    status,
    turn,
    muted,
    messages,
    error,
    remainingMs,
    start,
    stop,
    toggleMute,
  };
}
