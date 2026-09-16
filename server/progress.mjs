import { ASSESSMENT_ID, CORE_IDS, extraIds, getChapter, publicChapter } from "./chapters.mjs";

export const METRIC_LABELS = {
  fluency: "Fluency",
  responseSpeed: "Response speed",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  clarity: "Clarity",
  tone: "Professional tone",
  overall: "Overall score",
};

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function parseOrder(raw) {
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

export function ensureTopicOrder(db, user) {
  const extras = extraIds();
  const parsed = parseOrder(user.topic_order);
  let core = [];
  let extra = [];

  if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.core)) {
    core = parsed.core;
    extra = Array.isArray(parsed.extra) ? parsed.extra : [];
  } else if (Array.isArray(parsed)) {
    core = parsed.filter((id) => CORE_IDS.includes(id));
    extra = parsed.filter((id) => extras.includes(id));
  }

  core = core.filter((id) => CORE_IDS.includes(id));
  extra = extra.filter((id) => extras.includes(id));
  const missingCore = CORE_IDS.filter((id) => !core.includes(id));
  const missingExtra = extras.filter((id) => !extra.includes(id));

  if (
    missingCore.length ||
    missingExtra.length ||
    core.length !== CORE_IDS.length ||
    extra.length !== extras.length
  ) {
    core = core.concat(shuffle(missingCore));
    extra = extra.concat(shuffle(missingExtra));
    const next = JSON.stringify({ core, extra });
    db.prepare("UPDATE users SET topic_order = ? WHERE id = ?").run(next, user.id);
    user.topic_order = next;
  }

  return { core, extra };
}

export function bestOverall(scoredRows, chapterId) {
  let best = null;
  for (const row of scoredRows) {
    if (row.chapter_id !== chapterId) continue;
    const value = Number(row.overall);
    if (!Number.isFinite(value)) continue;
    best = best == null ? value : Math.max(best, value);
  }
  return best;
}

export function needsAssessment(scoredRows) {
  return scoredRows.length === 0;
}

export function isChapterUnlocked(scoredRows, chapterId) {
  if (chapterId === ASSESSMENT_ID) return true;
  return !needsAssessment(scoredRows);
}

export function decorateChapters(order, scoredRows) {
  if (needsAssessment(scoredRows)) return [];

  const lane = (ids, name) =>
    ids
      .map((id) => {
        const chapter = getChapter(id);
        if (!chapter) return null;
        const best = bestOverall(scoredRows, id);
        return {
          ...publicChapter(chapter),
          unlocked: true,
          lane: name,
          best: best == null ? null : Math.round(best),
        };
      })
      .filter(Boolean);

  return lane(order.core, "core").concat(lane(order.extra, "extra"));
}

export function situationProgress(scoredRows) {
  const chronological = [...scoredRows].reverse();
  const groups = new Map();

  for (const row of chronological) {
    const chapter = getChapter(row.chapter_id);
    if (!chapter) continue;
    const points = groups.get(row.chapter_id) || {
      chapterId: row.chapter_id,
      title: chapter.title,
      points: [],
    };
    points.points.push({
      sessionId: row.id,
      at: row.started_at,
      overall: Number.isFinite(Number(row.overall)) ? Number(row.overall) : null,
    });
    groups.set(row.chapter_id, points);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    points: group.points.slice(-5),
  }));
}
