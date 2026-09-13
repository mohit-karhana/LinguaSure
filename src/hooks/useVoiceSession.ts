import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { useCallback, useRef, useState } from "react";
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

function formatSessionError(sessionError: unknown): string {
  if (sessionError instanceof Error) return sessionError.message;
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

export function useVoiceSession(options: { sessionId: string; instructions: string }) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const messagesRef = useRef<TranscriptLine[]>([]);
  const speakingMsRef = useRef(0);
  const speakingStartedRef = useRef<number | null>(null);
  const lastCoachDoneRef = useRef<number | null>(null);
  const latenciesRef = useRef<number[]>([]);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [turn, setTurn] = useState<TurnState>("idle");
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const teardown = useCallback(() => {
    generationRef.current += 1;
    sessionRef.current?.close();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTurn("idle");
    setMuted(false);
  }, []);

  const start = useCallback(async () => {
    if (status === "connecting" || status === "live") return;

    setError(null);
    setMessages([]);
    messagesRef.current = [];
    speakingMsRef.current = 0;
    speakingStartedRef.current = null;
    lastCoachDoneRef.current = null;
    latenciesRef.current = [];
    setStatus("connecting");
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    try {
      const mediaStream = await getMicrophoneStream();
      if (generation !== generationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const { value: apiKey } = await api.token(options.sessionId);
      if (generation !== generationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = mediaStream;

      const session = new RealtimeSession(createCoach(options.instructions), {
        model: "gpt-realtime-2.1",
        transport: new OpenAIRealtimeWebRTC({ mediaStream }),
        config: {
          outputModalities: ["audio"],
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
              },
              turnDetection: {
                type: "semantic_vad",
                eagerness: "medium",
                createResponse: true,
                interruptResponse: true,
              },
            },
            output: {
              voice: "marin",
            },
          },
        },
      });

      session.on("history_updated", (history: RealtimeItem[]) => {
        const next = historyToTranscript(history);
        messagesRef.current = next;
        setMessages(next);
      });

      session.on("audio_start", () => setTurn("speaking"));
      session.on("audio_stopped", () => {
        lastCoachDoneRef.current = Date.now();
        setTurn("idle");
      });
      session.on("audio_interrupted", () => setTurn("listening"));

      session.on("error", ({ error: sessionError }) => {
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
      setStatus("live");
      setTurn("thinking");
    } catch (caught) {
      teardown();
      const message =
        caught instanceof Error ? caught.message : "Could not start talking.";
      setError(message);
      setStatus("error");
    }
  }, [options.instructions, options.sessionId, status, teardown]);

  const stop = useCallback(() => {
    const result = snapshot();
    teardown();
    setStatus("idle");
    return result;
  }, [snapshot, teardown]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session || status !== "live") return;

    const next = !session.muted;
    session.mute(next);
    setMuted(next);
  }, [status]);

  return {
    status,
    turn,
    muted,
    messages,
    error,
    start,
    stop,
    toggleMute,
  };
}
