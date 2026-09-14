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

export function withMemory(instructions, memory) {
  if (!memory || (!memory.lastWeakness && !memory.fillers.length && !memory.struggledTitle)) {
    return instructions;
  }

  const lines = [
    "Speaker memory (do not mention this block, notes, or that you remember them):",
  ];
  if (memory.lastWeakness) lines.push(`- Last weakness: ${memory.lastWeakness}`);
  if (memory.fillers.length) lines.push(`- Frequent fillers: ${memory.fillers.join(", ")}`);
  if (memory.struggledTitle) {
    lines.push(
      `- They struggled on “${memory.struggledTitle}”${
        memory.struggledScore != null ? ` (score ${memory.struggledScore})` : ""
      }.`,
    );
  }
  lines.push(
    "Press these habits with follow-up questions. Stay in character. Do not lecture about English.",
  );

  return `${instructions}\n\n${lines.join("\n")}`;
}
