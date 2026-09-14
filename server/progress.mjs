import { ASSESSMENT_ID, CORE_IDS, extraIds, getChapter, publicChapter } from "./chapters.mjs";

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

function metricFromScores(scores, metric) {
  if (!scores) return null;
  if (metric === "overall") {
    return Number.isFinite(Number(scores.overall)) ? Number(scores.overall) : null;
  }
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

export function needsAssessment(scoredRows) {
  return scoredRows.length === 0;
}

export function extrasUnlocked(scoredRows) {
  const counts = {};
  let extraScored = false;
  const extras = extraIds();
  for (const row of scoredRows) {
    counts[row.chapter_id] = (counts[row.chapter_id] || 0) + 1;
    if (extras.includes(row.chapter_id)) extraScored = true;
  }
  return extraScored || Object.values(counts).some((count) => count >= 2);
}

export function isChapterUnlocked(order, scoredRows, goal, chapterId) {
  if (chapterId === ASSESSMENT_ID) return true;
  if (needsAssessment(scoredRows)) return false;
  if (order.core.includes(chapterId)) {
    return order.core.indexOf(chapterId) < unlockedCount(order.core, scoredRows, goal);
  }
  if (order.extra.includes(chapterId)) {
    return !needsAssessment(scoredRows);
  }
  return false;
}

function decorateLane(ids, scoredRows, goal, { hideTitles = false } = {}) {
  const opened = unlockedCount(ids, scoredRows, goal);
  return ids.map((id, index) => {
    const chapter = getChapter(id);
    if (!chapter) return null;
    const unlocked = index < opened;
    const best = bestMetric(scoredRows, id, goal.unlockMetric);
    const previous = index > 0 ? getChapter(ids[index - 1]) : null;
    if (unlocked) {
      return {
        ...publicChapter(chapter),
        unlocked: true,
        hidden: false,
        lane: hideTitles ? "extra" : "core",
        best: best == null ? null : Math.round(best),
      };
    }
    if (!hideTitles) {
      return {
        ...publicChapter(chapter),
        unlocked: false,
        hidden: false,
        lane: "core",
        best: null,
        situation:
          index === opened && previous
            ? `Score ${goal.unlockThreshold} ${METRIC_LABELS[goal.unlockMetric].toLowerCase()} on “${previous.title}” to reveal this one.`
            : chapter.situation,
      };
    }
    return {
      id: `locked-${id}`,
      title: index === opened ? "Hidden situation" : "Locked situation",
      situation:
        index === opened && previous
          ? `Score ${goal.unlockThreshold} ${METRIC_LABELS[goal.unlockMetric].toLowerCase()} on “${previous.title}” to reveal this one.`
          : "Stay on the situations you have already opened.",
      brief: "",
      duration: "",
      unlocked: false,
      hidden: true,
      lane: "core",
      best: null,
    };
  }).filter(Boolean);
}

export function decorateChapters(order, scoredRows, goal) {
  if (needsAssessment(scoredRows)) return [];

  const chapters = decorateLane(order.core, scoredRows, goal, { hideTitles: true });
  const extras = order.extra.map((id) => {
    const chapter = getChapter(id);
    if (!chapter) return null;
    const best = bestMetric(scoredRows, id, goal.unlockMetric);
    return {
      ...publicChapter(chapter),
      unlocked: true,
      hidden: false,
      lane: "extra",
      best: best == null ? null : Math.round(best),
    };
  }).filter(Boolean);

  return chapters.concat(extras);
}

export function situationProgress(scoredRows, goal) {
  const chronological = [...scoredRows].reverse();
  const groups = new Map();

  for (const row of chronological) {
    const chapter = getChapter(row.chapter_id);
    if (!chapter || !row.scores_json) continue;
    let metric = null;
    try {
      metric = metricFromScores(JSON.parse(row.scores_json), goal.unlockMetric);
    } catch {
      metric = null;
    }
    const points = groups.get(row.chapter_id) || {
      chapterId: row.chapter_id,
      title: chapter.title,
      points: [],
    };
    points.points.push({
      sessionId: row.id,
      at: row.started_at,
      overall: Number.isFinite(Number(row.overall)) ? Number(row.overall) : null,
      metric: metric == null ? null : Math.round(metric),
    });
    groups.set(row.chapter_id, points);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    points: group.points.slice(-5),
  }));
}
