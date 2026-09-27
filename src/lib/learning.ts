import type { MetricKey } from "./types";

export type LearningGuide = {
  label: string;
  why: string;
  framework: string;
  drill: string;
  starters: string[];
  rescue: string[];
};

const GUIDES: Record<MetricKey, LearningGuide> = {
  fluency: {
    label: "Fluency",
    why: "You sound confident when your first sentence is simple and complete.",
    framework: "One clean sentence first, one detail second.",
    drill: "Answer three prompts in 15 seconds each without restarting.",
    starters: [
      "The short answer is...",
      "In simple terms,...",
      "The main point is...",
    ],
    rescue: [
      "Let me say that clearly in one line.",
      "I will keep this short.",
    ],
  },
  responseSpeed: {
    label: "Response speed",
    why: "Fast starts make you sound prepared under pressure.",
    framework: "Headline in 5 seconds, reason in 10.",
    drill: "Practice 5 rapid starts: answer before count of 5.",
    starters: [
      "My quick answer is...",
      "Right now, the key issue is...",
      "First, we should...",
    ],
    rescue: [
      "Give me one second — headline first: ...",
      "The immediate answer is...",
    ],
  },
  grammar: {
    label: "Grammar",
    why: "Clear tense and sentence endings improve credibility quickly.",
    framework: "Subject + verb + result. Finish the sentence fully.",
    drill: "Take 3 long answers and rewrite them into short correct sentences.",
    starters: [
      "We completed this because...",
      "I decided this after...",
      "The result was...",
    ],
    rescue: [
      "I will correct that sentence.",
      "Let me restate it clearly.",
    ],
  },
  vocabulary: {
    label: "Vocabulary",
    why: "Specific words make your answer sound senior and useful.",
    framework: "Replace vague words with precise nouns and actions.",
    drill: "Swap 5 vague words (good, thing, issue) with concrete terms.",
    starters: [
      "The root cause was...",
      "The trade-off was...",
      "The measurable impact was...",
    ],
    rescue: [
      "A more precise word is...",
      "Specifically, I mean...",
    ],
  },
  clarity: {
    label: "Clarity",
    why: "Structured answers are easier to trust and remember.",
    framework: "Point -> reason -> next step.",
    drill: "Use the same framework for 3 different questions.",
    starters: [
      "My point is...",
      "The reason is...",
      "The next step is...",
    ],
    rescue: [
      "I will answer in three parts.",
      "Let me start with the point.",
    ],
  },
  tone: {
    label: "Professional tone",
    why: "Calm, direct language keeps control in hard conversations.",
    framework: "Acknowledge -> decision -> action.",
    drill: "Practice one disagreement using calm, non-defensive language.",
    starters: [
      "I understand the concern.",
      "My recommendation is...",
      "Here is what I will do next...",
    ],
    rescue: [
      "I hear you — here is the direct answer.",
      "Let us focus on the decision and next action.",
    ],
  },
};

const CHAPTER_DEFAULTS: Record<string, MetricKey> = {
  interview: "responseSpeed",
  "about-you": "fluency",
  "project-explain": "clarity",
  standup: "clarity",
  manager: "tone",
  client: "clarity",
  escalation: "tone",
  salary: "tone",
  exec: "responseSpeed",
  ambiguous: "clarity",
  disagreement: "tone",
  "remote-meeting": "clarity",
  assessment: "fluency",
};

export function metricFromChapter(chapterId: string): MetricKey {
  return CHAPTER_DEFAULTS[chapterId] || "clarity";
}

export function asMetricKey(value: string | null | undefined): MetricKey | null {
  if (!value) return null;
  if (value in GUIDES) return value as MetricKey;
  return null;
}

export function learningGuide(metric: string | null | undefined): LearningGuide {
  const key = asMetricKey(metric) || "clarity";
  return GUIDES[key];
}

export function strongestMetric(metrics: Record<string, number | null>) {
  const ranked = Object.entries(metrics)
    .filter(([, value]) => value != null)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return asMetricKey(ranked[0]?.[0] ?? null);
}
