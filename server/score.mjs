const FILLER_RE =
  /\b(um+|uh+|er+|ah+|like|you know|basically|actually|sort of|kind of|i mean)\b/gi;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
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

  const fluency = clamp(100 - Math.abs((wpm || 130) - 145) * 0.7 - per100 * 4, 35, 97);
  const responseSpeed = avgLatencyMs
    ? clamp(100 - Math.max(0, avgLatencyMs - 900) / 40, 35, 97)
    : 55;
  const fillerScore = clamp(100 - per100 * 8, 30, 98);

  return {
    words,
    wpm: Math.round(wpm),
    speakingMs,
    avgLatencyMs: Math.round(avgLatencyMs),
    fillerCount: fillers.length,
    fillerExamples: [...new Set(fillers)].slice(0, 6),
    per100Words: Number(per100.toFixed(1)),
    fluency,
    responseSpeed,
    fillerScore,
  };
}

function fallbackLinguistic(acoustic) {
  return {
    grammar: {
      score: clamp(acoustic.fluency - 4, 40, 88),
      examples: ["Not enough speech yet to quote a specific grammar miss."],
    },
    vocabulary: {
      score: clamp(acoustic.fluency - 2, 40, 88),
      examples: ["Keep the same situation and speak a little longer next time."],
    },
    clarity: {
      score: clamp(acoustic.fluency, 40, 88),
      note: "The transcript was too short to judge how clearly you made the point.",
    },
    unexpected: {
      score: clamp(acoustic.responseSpeed, 40, 88),
      note: "We could not see how you handled a real follow-up yet.",
    },
    tone: {
      score: 70,
      note: "Professional tone needs a longer workplace turn to score fairly.",
    },
  };
}

export async function scoreWithModel(chapter, transcript, acoustic) {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackLinguistic(acoustic);
  }

  const spoken = transcript.filter((line) => line.role === "user").map((line) => line.text).join(" ");
  if (wordCount(spoken) < 12) {
    return fallbackLinguistic(acoustic);
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
Scores must be explainable. Quote the user's words. Never mention being an AI.`,
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
    grammar: parsed.grammar ?? fallbackLinguistic(acoustic).grammar,
    vocabulary: parsed.vocabulary ?? fallbackLinguistic(acoustic).vocabulary,
    clarity: parsed.clarity ?? fallbackLinguistic(acoustic).clarity,
    unexpected: parsed.unexpected ?? fallbackLinguistic(acoustic).unexpected,
    tone: parsed.tone ?? fallbackLinguistic(acoustic).tone,
    weakness: typeof parsed.weakness === "string" ? parsed.weakness : null,
    nextFocus: typeof parsed.nextFocus === "string" ? parsed.nextFocus : null,
  };
}

export function buildScorecard(chapter, transcript, timings, model) {
  const acoustic = scoreAcoustic(transcript, timings);
  const linguistic = model ?? fallbackLinguistic(acoustic);
  const metrics = {
    fluency: acoustic.fluency,
    responseSpeed: acoustic.responseSpeed,
    grammar: Number(linguistic.grammar?.score) || acoustic.fluency,
    vocabulary: Number(linguistic.vocabulary?.score) || acoustic.fluency,
    clarity: Number(linguistic.clarity?.score) || acoustic.fluency,
    tone: Number(linguistic.tone?.score) || 70,
  };
  const overall = clamp(
    Object.values(metrics).reduce((sum, value) => sum + value, 0) / 6,
    1,
    100,
  );

  return {
    overall,
    metrics,
    acoustic: {
      speakingSpeed: {
        score: acoustic.fluency,
        wpm: acoustic.wpm,
        note: acoustic.wpm
          ? `About ${acoustic.wpm} words per minute while you were speaking.`
          : "Not enough timed speech to measure speed.",
      },
      pauses: {
        score: acoustic.responseSpeed,
        avgLatencyMs: acoustic.avgLatencyMs,
        note: acoustic.avgLatencyMs
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
  let counted = 0;

  for (const row of rows) {
    if (!row.scores_json) continue;
    const scores = JSON.parse(row.scores_json);
    if (!scores?.metrics) continue;
    counted += 1;
    for (const key of keys) {
      totals[key] += Number(scores.metrics[key]) || 0;
    }
  }

  return {
    sessionCount: rows.length,
    lastOverall: rows[0]?.overall ?? null,
    bestOverall: rows.reduce((best, row) => Math.max(best, row.overall ?? 0), 0) || null,
    latestWeakness: rows[0]?.weakness ?? null,
    metrics: counted
      ? Object.fromEntries(keys.map((key) => [key, Math.round(totals[key] / counted)]))
      : null,
  };
}
