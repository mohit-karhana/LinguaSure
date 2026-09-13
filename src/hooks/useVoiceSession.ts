import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { useCallback, useRef, useState } from "react";
import { createCoach } from "../lib/coach";
import { getMicrophoneStream } from "../lib/microphone";
import { historyToTranscript, type TranscriptLine } from "../lib/transcript";

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

async function fetchEphemeralKey(): Promise<string> {
  const response = await fetch("/api/token", { method: "POST" });
  const data = (await response.json()) as { value?: string; error?: string };

  if (!response.ok || !data.value) {
    throw new Error(data.error || "Could not start a live session.");
  }

  return data.value;
}

export function useVoiceSession() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [turn, setTurn] = useState<TurnState>("idle");
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    setStatus("connecting");
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    try {
      const mediaStream = await getMicrophoneStream();
      if (generation !== generationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const apiKey = await fetchEphemeralKey();
      if (generation !== generationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = mediaStream;

      const session = new RealtimeSession(createCoach(), {
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
        setMessages(historyToTranscript(history));
      });

      session.on("audio_start", () => setTurn("speaking"));
      session.on("audio_stopped", () => setTurn("idle"));
      session.on("audio_interrupted", () => setTurn("listening"));

      session.on("error", ({ error: sessionError }) => {
        setError(formatSessionError(sessionError));
        setStatus("error");
        teardown();
      });

      session.on("transport_event", (event: TransportEvent) => {
        if (event.type === "input_audio_buffer.speech_started") {
          setTurn("listening");
        } else if (event.type === "input_audio_buffer.speech_stopped") {
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
  }, [status, teardown]);

  const stop = useCallback(() => {
    teardown();
    setStatus("idle");
  }, [teardown]);

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
