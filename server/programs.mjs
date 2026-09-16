import { ASSESSMENT_ID, getChapter } from "./chapters.mjs";
import { METRIC_LABELS, needsAssessment } from "./progress.mjs";

// A program is a fixed sequence of existing scenarios and short drills with an
// end state. Steps: kind "session" is a full practice call, kind "drill" is a
// two-minute rapid round focused on one metric.
export const PROGRAMS = [
  {
    id: "interview-ready",
    title: "Interview Ready",
    tagline: "Fourteen days to walk into interviews calm and specific.",
    focusArea: "interview",
    steps: [
      { chapterId: "about-you", kind: "session", label: "Baseline: your story" },
      { chapterId: "interview", kind: "session", label: "Baseline: full interview" },
      { chapterId: "about-you", kind: "drill", focus: "responseSpeed", label: "Drill: answer faster" },
      { chapterId: "project-explain", kind: "session" },
      { chapterId: "hiring", kind: "session" },
      { chapterId: "project-explain", kind: "drill", focus: "clarity", label: "Drill: point first" },
      { chapterId: "interview", kind: "session", label: "Retry: measure the delta" },
      { chapterId: "salary", kind: "session" },
      { chapterId: "about-you", kind: "session", label: "Retry: tighter story" },
      { chapterId: "presentation-qa", kind: "session" },
      { chapterId: "interview", kind: "drill", focus: "fluency", label: "Drill: clean sentences" },
      { chapterId: "hiring", kind: "session", label: "Retry: own the 'I'" },
      { chapterId: "salary", kind: "drill", focus: "tone", label: "Drill: hold the number" },
      { chapterId: "interview", kind: "session", label: "Final: full interview" },
    ],
  },
  {
    id: "meeting-confident",
    title: "Meeting Confident",
    tagline: "Twenty-one days to speak up in meetings without rehearsing.",
    focusArea: "workplace",
    steps: [
      { chapterId: "standup", kind: "session", label: "Baseline: your update" },
      { chapterId: "manager", kind: "session" },
      { chapterId: "standup", kind: "drill", focus: "responseSpeed", label: "Drill: headline first" },
      { chapterId: "exec", kind: "session" },
      { chapterId: "disagreement", kind: "session" },
      { chapterId: "ambiguous", kind: "session" },
      { chapterId: "exec", kind: "drill", focus: "clarity", label: "Drill: one-sentence brief" },
      { chapterId: "pushback", kind: "session" },
      { chapterId: "feedback-get", kind: "session" },
      { chapterId: "standup", kind: "session", label: "Retry: measure the delta" },
      { chapterId: "skip-level", kind: "session" },
      { chapterId: "allhands", kind: "session" },
      { chapterId: "disagreement", kind: "drill", focus: "tone", label: "Drill: firm, not sharp" },
      { chapterId: "remote-meeting", kind: "session" },
      { chapterId: "late", kind: "session" },
      { chapterId: "manager", kind: "session", label: "Retry: clear ask" },
      { chapterId: "bad-news", kind: "session" },
      { chapterId: "apology", kind: "session" },
      { chapterId: "exec", kind: "session", label: "Retry: 60-second brief" },
      { chapterId: "allhands", kind: "drill", focus: "fluency", label: "Drill: no fillers in public" },
      { chapterId: "disagreement", kind: "session", label: "Final: disagree and land it" },
    ],
  },
  {
    id: "client-trusted",
    title: "Client Trusted",
    tagline: "Ten days to explain, recover, and negotiate with clients.",
    focusArea: "client",
    steps: [
      { chapterId: "client", kind: "session", label: "Baseline: explain a change" },
      { chapterId: "discovery", kind: "session" },
      { chapterId: "client", kind: "drill", focus: "clarity", label: "Drill: no jargon" },
      { chapterId: "escalation", kind: "session" },
      { chapterId: "demo", kind: "session" },
      { chapterId: "late", kind: "session" },
      { chapterId: "vendor", kind: "session" },
      { chapterId: "apology", kind: "session" },
      { chapterId: "escalation", kind: "drill", focus: "tone", label: "Drill: calm under fire" },
      { chapterId: "client", kind: "session", label: "Final: measure the delta" },
    ],
  },
];

export function getProgram(id) {
  return PROGRAMS.find((program) => program.id === id) ?? null;
}

export function programForFocusArea(focusArea) {
  return PROGRAMS.find((program) => program.focusArea === focusArea) ?? PROGRAMS[0];
}

function publicStep(step, done) {
  const chapter = getChapter(step.chapterId);
  return {
    chapterId: step.chapterId,
    kind: step.kind,
    focus: step.focus ?? null,
    title: step.label || chapter?.title || step.chapterId,
    chapterTitle: chapter?.title || step.chapterId,
    done,
  };
}

// Greedy chronological matching: each scored session since the program start
// can complete at most the next incomplete step. Full sessions satisfy drill
// steps too; a two-minute drill never satisfies a full-session step.
export function programState(user, scoredRows) {
  const program = getProgram(user.program_id);
  if (!program || !user.program_started_at) return null;

  const chronological = [...scoredRows]
    .reverse()
    .filter((row) => row.started_at >= user.program_started_at);

  let completed = 0;
  for (const row of chronological) {
    const step = program.steps[completed];
    if (!step) break;
    if (row.chapter_id !== step.chapterId) continue;
    if (step.kind === "session" && row.kind === "drill") continue;
    completed += 1;
  }

  const done = completed >= program.steps.length;
  return {
    id: program.id,
    title: program.title,
    tagline: program.tagline,
    totalDays: program.steps.length,
    day: Math.min(completed + 1, program.steps.length),
    completed,
    done,
    next: done ? null : publicStep(program.steps[completed], false),
    steps: program.steps.map((step, index) => publicStep(step, index < completed)),
  };
}

export function publicPrograms() {
  return PROGRAMS.map((program) => ({
    id: program.id,
    title: program.title,
    tagline: program.tagline,
    totalDays: program.steps.length,
  }));
}

const METRIC_TO_CHAPTER = {
  fluency: "about-you",
  responseSpeed: "exec",
  grammar: "client",
  vocabulary: "project-explain",
  clarity: "ambiguous",
  tone: "escalation",
};

export function weakestMetric(profile) {
  if (!profile?.metrics) return null;
  const ranked = Object.entries(profile.metrics)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  return ranked[0]?.[0] ?? null;
}

export function todayRecommendation(user, scoredRows, profile) {
  if (needsAssessment(scoredRows)) {
    const chapter = getChapter(ASSESSMENT_ID);
    return {
      type: "assessment",
      chapterId: ASSESSMENT_ID,
      kind: "assessment",
      focus: null,
      title: chapter?.title || "Where you stand",
      reason: "One mixed 8-minute conversation. Then a profile, a plan, and the gym.",
    };
  }

  const program = programState(user, scoredRows);
  if (program && !program.done && program.next) {
    return {
      type: "program",
      chapterId: program.next.chapterId,
      kind: program.next.kind,
      focus: program.next.focus,
      title: program.next.title,
      reason: `Day ${program.day} of ${program.totalDays} · ${program.title}`,
    };
  }

  const weakest = weakestMetric(profile);
  const chapterId = METRIC_TO_CHAPTER[weakest] || "interview";
  const chapter = getChapter(chapterId);
  return {
    type: "coach",
    chapterId,
    kind: "session",
    focus: weakest,
    title: chapter?.title || chapterId,
    reason: weakest
      ? `Your weakest metric is ${METRIC_LABELS[weakest].toLowerCase()}. This situation trains it.`
      : "Keep the habit: one short scored session today.",
  };
}

export function drillRecommendation(scoredRows, profile) {
  if (needsAssessment(scoredRows)) return null;
  const weakest = weakestMetric(profile) || "responseSpeed";
  const chapterId = METRIC_TO_CHAPTER[weakest] || "exec";
  const chapter = getChapter(chapterId);
  return {
    chapterId,
    focus: weakest,
    title: chapter?.title || chapterId,
    label: `2-minute drill · ${METRIC_LABELS[weakest].toLowerCase()}`,
  };
}
