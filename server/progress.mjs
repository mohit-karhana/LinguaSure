import { CHAPTERS, getChapter, publicChapter } from "./chapters.mjs";

export const UNLOCK_METRICS = [
  "fluency",
  "responseSpeed",
  "grammar",
  "vocabulary",
  "clarity",
  "tone",
  "overall",
];

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

export function clampThreshold(value, fallback = 70) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(50, Math.min(95, Math.round(parsed))) : fallback;
}

export function defaultThresholds(fallback = 70) {
  const threshold = clampThreshold(fallback, 70);
  return Object.fromEntries(UNLOCK_METRICS.map((metric) => [metric, threshold]));
}

export function normalizeThresholds(raw, fallback = 70) {
  const thresholds = defaultThresholds(fallback);
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object") return thresholds;
  for (const metric of UNLOCK_METRICS) {
    if (parsed[metric] != null) thresholds[metric] = clampThreshold(parsed[metric], thresholds[metric]);
  }
  return thresholds;
}

export function normalizeGoal(metric, threshold, storedThresholds) {
  const unlockMetric = UNLOCK_METRICS.includes(metric) ? metric : "fluency";
  const thresholds = normalizeThresholds(storedThresholds, threshold ?? 70);
  if (threshold != null) thresholds[unlockMetric] = clampThreshold(threshold, thresholds[unlockMetric]);
  return {
    unlockMetric,
    unlockThreshold: thresholds[unlockMetric],
    thresholds,
  };
}

export function userGoal(user) {
  return normalizeGoal(user.unlock_metric, user.unlock_threshold ?? 70, user.unlock_thresholds);
}

export function ensureTopicOrder(db, user) {
  const allIds = CHAPTERS.map((chapter) => chapter.id);
  let order = [];
  try {
    order = JSON.parse(user.topic_order || "[]");
  } catch {
    order = [];
  }
  if (!Array.isArray(order)) order = [];

  const known = new Set(allIds);
  order = order.filter((id) => known.has(id));
  const missing = allIds.filter((id) => !order.includes(id));
  if (missing.length || order.length !== allIds.length) {
    order = order.concat(shuffle(missing));
    db.prepare("UPDATE users SET topic_order = ? WHERE id = ?").run(
      JSON.stringify(order),
      user.id,
    );
    user.topic_order = JSON.stringify(order);
  }
  return order;
}

function metricFromScores(scores, metric) {
  if (!scores) return null;
  if (metric === "overall") return Number(scores.overall) || null;
  const value = scores.metrics?.[metric];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function bestMetric(scoredRows, chapterId, metric) {
  let best = null;
  for (const row of scoredRows) {
    if (row.chapter_id !== chapterId || !row.scores_json) continue;
    try {
      const value = metricFromScores(JSON.parse(row.scores_json), metric);
      if (value == null) continue;
      best = best == null ? value : Math.max(best, value);
    } catch {
      // ignore broken score rows
    }
  }
  return best;
}

export function unlockedCount(order, scoredRows, goal) {
  let opened = 1;
  for (let index = 0; index < order.length - 1; index += 1) {
    const best = bestMetric(scoredRows, order[index], goal.unlockMetric);
    if (best == null || best < goal.unlockThreshold) break;
    opened += 1;
  }
  return opened;
}

export function isChapterUnlocked(order, scoredRows, goal, chapterId) {
  const position = order.indexOf(chapterId);
  if (position < 0) return false;
  return position < unlockedCount(order, scoredRows, goal);
}

export function decorateChapters(order, scoredRows, goal) {
  const opened = unlockedCount(order, scoredRows, goal);
  return order.map((id, index) => {
    const chapter = getChapter(id);
    const unlocked = index < opened;
    const best = bestMetric(scoredRows, id, goal.unlockMetric);
    const previous = index > 0 ? getChapter(order[index - 1]) : null;
    if (unlocked && chapter) {
      return {
        ...publicChapter(chapter),
        unlocked: true,
        hidden: false,
        best: best == null ? null : Math.round(best),
      };
    }
    return {
      id: `locked-${index}`,
      title: index === opened ? "Hidden situation" : "Locked situation",
      situation:
        index === opened && previous
          ? `Score ${goal.unlockThreshold} ${METRIC_LABELS[goal.unlockMetric].toLowerCase()} on “${previous.title}” to reveal this one.`
          : "Stay on the situations you have already opened.",
      brief: "",
      duration: "",
      unlocked: false,
      hidden: true,
      best: null,
    };
  });
}
