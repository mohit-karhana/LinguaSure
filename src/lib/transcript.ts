import type { RealtimeItem } from "@openai/agents/realtime";

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ContentPart = {
  transcript?: string | null;
  text?: string;
};

function contentText(item: RealtimeItem): string {
  if (item.type !== "message") return "";

  const content = "content" in item && Array.isArray(item.content) ? item.content : [];

  return content
    .map((part: ContentPart) => part.transcript || part.text || "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function historyToTranscript(history: RealtimeItem[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];

  for (const item of history) {
    if (item.type !== "message") continue;
    if (item.role !== "user" && item.role !== "assistant") continue;

    const text = contentText(item);
    if (!text) continue;

    lines.push({
      id: item.itemId,
      role: item.role,
      text,
    });
  }

  return lines;
}
