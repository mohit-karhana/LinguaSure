const FILLER_RE =
  /\b(um+|uh+|er+|ah+|like|you know|basically|actually|sort of|kind of|i mean)\b/gi;

export const MIN_LINGUISTIC_WORDS = 40;
export const MIN_ACOUSTIC_WORDS = 8;
export const MIN_SPEAKING_MS = 3000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function numOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 1, 100) : null;
}

export function collectFillers(text) {
  return [...text.matchAll(FILLER_RE)].map((match) => match[0].toLowerCase());
}

export function scoreAcoustic(transcript, timings = {}) {
  const userText = transcript
    .filter((line) => line.role === "user")
    .map((line) => line.text)
    .join(" ");
  const words = wordCount(userText);
  const speakingMs = Number(timings.speakingMs) || 0;
  const latencies = Array.isArray(timings.latenciesMs) ? timings.latenciesMs : [];
  const avgLatencyMs = latencies.length
    ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
    : Number(timings.avgLatencyMs) || 0;
  const wpm = speakingMs > 0 ? (words / speakingMs) * 60_000 : 0;
  const fillers = collectFillers(userText);
  const per100 = words > 0 ? (fillers.length / words) * 100 : 0;
  const acousticReady = words >= MIN_ACOUSTIC_WORDS && speakingMs >= MIN_SPEAKING_MS;

  return {
    words,
    wpm: Math.round(wpm),
    speakingMs,
    avgLatencyMs: Math.round(avgLatencyMs),
    fillerCount: fillers.length,
    fillerExamples: [...new Set(fillers)].slice(0, 6),
    per100Words: Number(per100.toFixed(1)),
    fluency: acousticReady
      ? clamp(100 - Math.abs(wpm - 145) * 0.7 - per100 * 4, 35, 97)
      : null,
    responseSpeed: avgLatencyMs
      ? clamp(100 - Math.max(0, avgLatencyMs - 900) / 40, 35, 97)
      : null,
    fillerScore: words >= MIN_ACOUSTIC_WORDS ? clamp(100 - per100 * 8, 30, 98) : null,
  };
}

function insufficientLinguistic() {
  return {
    sufficient: false,
    grammar: { score: null, examples: ["Not enough speech to score grammar."] },
    vocabulary: { score: null, examples: ["Not enough speech to score vocabulary."] },
    clarity: { score: null, note: "Not enough evidence to score clarity." },
    unexpected: { score: null, note: "Not enough evidence to score unexpected follow-ups." },
    tone: { score: null, note: "Not enough evidence to score professional tone." },
    weakness: "You started the situation, but we need a longer turn before we invent a score.",
    nextFocus: "Retry and speak in full sentences for a few minutes. We only score what we can hear.",
  };
}

export async function scoreWithModel(chapter, transcript, acoustic) {
  const spoken = transcript
    .filter((line) => line.role === "user")
    .map((line) => line.text)
    .join(" ");
  if (wordCount(spoken) < MIN_LINGUISTIC_WORDS || !process.env.OPENAI_API_KEY) {
    return insufficientLinguistic();
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You score spoken workplace English for LinguaSure. This is not a language-school test.
Return JSON only with this shape:
{
  "grammar": { "score": 0-100, "examples": ["quote a real miss, then the tighter version"] },
  "vocabulary": { "score": 0-100, "examples": ["quote a vague word and a sharper one"] },
  "clarity": { "score": 0-100, "note": "one sentence" },
  "unexpected": { "score": 0-100, "note": "how they handled a follow-up they did not rehearse" },
  "tone": { "score": 0-100, "note": "professional tone, not friendliness" },
  "weakness": "one plain sentence, like: you explain well, but you stall when the question is unexpected",
  "nextFocus": "one concrete thing to try on the next retry of the same situation"
}
Scores must be explainable and must differ when the evidence differs. Quote the user's words. Never mention being an AI. If a dimension cannot be judged from the transcript, omit its score.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            situation: chapter.title,
            brief: chapter.situation,
            acoustic,
            transcript,
          }),
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Scoring model request failed.");
  }

  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return {
    sufficient: true,
    grammar: parsed.grammar ?? { score: null, examples: [] },
    vocabulary: parsed.vocabulary ?? { score: null, examples: [] },
    clarity: parsed.clarity ?? { score: null, note: "Not enough evidence." },
    unexpected: parsed.unexpected ?? { score: null, note: "Not enough evidence." },
    tone: parsed.tone ?? { score: null, note: "Not enough evidence." },
    weakness: typeof parsed.weakness === "string" ? parsed.weakness : null,
    nextFocus: typeof parsed.nextFocus === "string" ? parsed.nextFocus : null,
  };
}

export function buildScorecard(chapter, transcript, timings, model) {
  const acoustic = scoreAcoustic(transcript, timings);
  const linguistic = model ?? insufficientLinguistic();
  const metrics = {
    fluency: acoustic.fluency,
    responseSpeed: acoustic.responseSpeed,
    grammar: linguistic.sufficient ? numOrNull(linguistic.grammar?.score) : null,
    vocabulary: linguistic.sufficient ? numOrNull(linguistic.vocabulary?.score) : null,
    clarity: linguistic.sufficient ? numOrNull(linguistic.clarity?.score) : null,
    tone: linguistic.sufficient ? numOrNull(linguistic.tone?.score) : null,
  };
  const present = Object.values(metrics).filter((value) => Number.isFinite(value));
  const overall = present.length ? clamp(present.reduce((sum, value) => sum + value, 0) / present.length, 1, 100) : null;

  return {
    overall,
    metrics,
    evidence: {
      acoustic: acoustic.fluency != null || acoustic.responseSpeed != null,
      linguistic: Boolean(linguistic.sufficient),
      words: acoustic.words,
    },
    acoustic: {
      speakingSpeed: {
        score: acoustic.fluency,
        wpm: acoustic.wpm,
        note: acoustic.fluency != null
          ? `About ${acoustic.wpm} words per minute while you were speaking.`
          : "Not enough timed speech to measure speed.",
      },
      pauses: {
        score: acoustic.responseSpeed,
        avgLatencyMs: acoustic.avgLatencyMs,
        note: acoustic.responseSpeed != null
          ? `Average ${Math.round(acoustic.avgLatencyMs / 100) / 10}s before you started answering.`
          : "We could not time the gap before your answers.",
      },
      fillers: {
        score: acoustic.fillerScore,
        count: acoustic.fillerCount,
        per100Words: acoustic.per100Words,
        examples: acoustic.fillerExamples,
      },
    },
    linguistic: {
      grammar: linguistic.grammar,
      vocabulary: linguistic.vocabulary,
    },
    communicative: {
      clarity: linguistic.clarity,
      unexpected: linguistic.unexpected,
      tone: linguistic.tone,
    },
    weakness:
      linguistic.weakness ||
      "You started the situation, but we need a longer turn to name a specific weakness.",
    nextFocus:
      linguistic.nextFocus ||
      `Retry ${chapter.title} and finish your first answer in one sentence before you add detail.`,
    chapterId: chapter.id,
  };
}

export function summarizeProfile(rows) {
  if (!rows.length) {
    return {
      sessionCount: 0,
      lastOverall: null,
      bestOverall: null,
      latestWeakness: null,
      metrics: null,
    };
  }

  const keys = ["fluency", "responseSpeed", "grammar", "vocabulary", "clarity", "tone"];
  const totals = Object.fromEntries(keys.map((key) => [key, 0]));
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));

  for (const row of rows) {
    if (!row.scores_json) continue;
    const scores = JSON.parse(row.scores_json);
    if (!scores?.metrics) continue;
    for (const key of keys) {
      const value = Number(scores.metrics[key]);
      if (!Number.isFinite(value)) continue;
      totals[key] += value;
      counts[key] += 1;
    }
  }

  const metrics = Object.fromEntries(
    keys.map((key) => [key, counts[key] ? Math.round(totals[key] / counts[key]) : null]),
  );
  const any = Object.values(metrics).some((value) => value != null);

  return {
    sessionCount: rows.length,
    lastOverall: rows[0]?.overall ?? null,
    bestOverall: rows.reduce((best, row) => Math.max(best, row.overall ?? 0), 0) || null,
    latestWeakness: rows[0]?.weakness ?? null,
    metrics: any ? metrics : null,
  };
}
