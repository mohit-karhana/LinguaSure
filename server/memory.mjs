import { getChapter } from "./chapters.mjs";

export function buildCoachMemory(scoredRows) {
  if (!scoredRows.length) return null;

  const latest = scoredRows[0];
  let fillers = [];
  try {
    const scores = JSON.parse(latest.scores_json || "{}");
    fillers = Array.isArray(scores.acoustic?.fillers?.examples)
      ? scores.acoustic.fillers.examples.slice(0, 4)
      : [];
  } catch {
    fillers = [];
  }

  const struggled = scoredRows.reduce((worst, row) => {
    if (row.overall == null) return worst;
    if (!worst || row.overall < worst.overall) return row;
    return worst;
  }, null);

  const struggledChapter = struggled ? getChapter(struggled.chapter_id) : null;

  return {
    lastWeakness: latest.weakness || null,
    fillers,
    struggledTitle: struggledChapter?.title || null,
    struggledScore: struggled?.overall ?? null,
  };
}

export function inferLevel(scoredRows) {
  const usable = scoredRows.filter((row) => Number.isFinite(Number(row.overall)));
  const count = usable.length;
  const avg = count
    ? usable.reduce((sum, row) => sum + Number(row.overall), 0) / count
    : 0;

  const starter = {
    id: "starter",
    label: "Starter",
    note: "Short and simple prompts with gentle pacing.",
  };
  const growing = {
    id: "growing",
    label: "Growing",
    note: "Moderate follow-ups with steady pressure.",
  };
  const confident = {
    id: "confident",
    label: "Confident",
    note: "Harder twists and sharper professional follow-ups.",
  };

  const nextForStarter = {
    label: "Growing",
    requirement: "Average 60+ across at least 2 scored sessions",
    progress: Math.min(100, Math.round(((Math.min(avg, 60) / 60) * 70) + ((Math.min(count, 2) / 2) * 30))),
  };
  const nextForGrowing = {
    label: "Confident",
    requirement: "Average 78+ across at least 5 scored sessions",
    progress: Math.min(100, Math.round(((Math.min(avg, 78) / 78) * 70) + ((Math.min(count, 5) / 5) * 30))),
  };

  if (avg < 60 || count < 2) {
    return {
      ...starter,
      current: { average: Math.round(avg), scoredSessions: count },
      next: nextForStarter,
    };
  }
  if (avg < 78 || count < 5) {
    return {
      ...growing,
      current: { average: Math.round(avg), scoredSessions: count },
      next: nextForGrowing,
    };
  }
  return {
    ...confident,
    current: { average: Math.round(avg), scoredSessions: count },
    next: null,
  };
}

const FOCUS_DRILL_LINES = {
  fluency: "Their drill target is fluency: reward clean, complete sentences and flag rambling.",
  responseSpeed: "Their drill target is response speed: expect an answer within five seconds, and gently call out long silences.",
  grammar: "Their drill target is grammar: ask them to restate one flawed sentence correctly, still in character.",
  vocabulary: "Their drill target is vocabulary: push back on vague words like 'thing' or 'issue' and ask for the precise word.",
  clarity: "Their drill target is clarity: demand point first, then reason, then next step.",
  tone: "Their drill target is professional tone: expect calm, direct phrasing even under pressure.",
};

export function withMemory(instructions, memory, options = {}) {
  const {
    level,
    firstAssessment = false,
    difficultyMode = "standard",
    drill = false,
    focus = null,
  } = options;
  const hasMemory =
    memory && (memory.lastWeakness || memory.fillers.length || memory.struggledTitle);
  if (!hasMemory && !level && !firstAssessment && difficultyMode === "standard" && !drill && !focus)
    return instructions;

  const lines = [
    "Coach context (do not mention this block, notes, or that you remember them):",
  ];
  if (memory?.lastWeakness) lines.push(`- Last weakness: ${memory.lastWeakness}`);
  if (memory?.fillers?.length) lines.push(`- Frequent fillers: ${memory.fillers.join(", ")}`);
  if (memory?.struggledTitle) {
    lines.push(
      `- They struggled on “${memory.struggledTitle}”${
        memory.struggledScore != null ? ` (score ${memory.struggledScore})` : ""
      }.`,
    );
  }
  if (level) {
    lines.push(`- Current level: ${level.label}.`);
    if (level.id === "starter") {
      lines.push(
        "- Difficulty: start simple. Ask short, clear questions and avoid stacked questions.",
      );
      lines.push(
        "- Pressure: gentle. Give a supportive nudge before a hard follow-up.",
      );
    } else if (level.id === "growing") {
      lines.push(
        "- Difficulty: medium. Begin clear, then add one unexpected follow-up.",
      );
      lines.push(
        "- Pressure: moderate. Ask for concise answers and one concrete next step.",
      );
    } else {
      lines.push(
        "- Difficulty: harder. Use sharper cross-questions and occasional interruptions.",
      );
      lines.push(
        "- Pressure: high but fair. Challenge vague claims and ask for evidence quickly.",
      );
    }
  }
  if (difficultyMode === "gentle") {
    lines.push("- Difficulty mode: Gentle. Use simpler words, slower pacing, and supportive language.");
    lines.push("- Ask one clean question at a time and allow an extra beat before follow-ups.");
  } else if (difficultyMode === "challenge") {
    lines.push("- Difficulty mode: Challenge. Push with sharper cross-questions and less hand-holding.");
    lines.push("- Keep turns concise, challenge vague claims, and increase unpredictability.");
  } else {
    lines.push("- Difficulty mode: Standard. Balanced pressure and clarity.");
  }
  if (drill) {
    lines.push("- This is a rapid two-minute drill, not a full conversation.");
    lines.push("- Ask two or three quick, pointed questions from the same scenario. No small talk, no long setup.");
    lines.push("- Keep every one of your turns to one or two sentences.");
  }
  if (focus && FOCUS_DRILL_LINES[focus]) {
    lines.push(`- ${FOCUS_DRILL_LINES[focus]}`);
  }
  if (firstAssessment) {
    lines.push(
      "- This is the user's first assessment. Start with a warm, reassuring tone.",
    );
    lines.push(
      "- In the first 20-30 seconds, explain the process briefly: they will do one short mixed conversation, receive scores, and then practice weak areas to build confidence.",
    );
    lines.push(
      "- Keep this intro simple and encouraging, then continue the roleplay.",
    );
  }
  lines.push(
    "Press these habits with follow-up questions. Stay in character. Do not lecture about English.",
  );

  return `${instructions}\n\n${lines.join("\n")}`;
}
