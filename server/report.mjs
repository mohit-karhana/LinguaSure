import { randomUUID } from "node:crypto";
import { getChapter } from "./chapters.mjs";
import { db } from "./db.mjs";
import { METRIC_LABELS } from "./progress.mjs";

const selectReport = db.prepare(
  "SELECT * FROM weekly_reports WHERE user_id = ? AND week_start = ?",
);
const insertReport = db.prepare(`
  INSERT INTO weekly_reports (id, user_id, week_start, report_json, created_at)
  VALUES (@id, @user_id, @week_start, @report_json, @created_at)
  ON CONFLICT(user_id, week_start) DO NOTHING
`);

export function weekStartIso(now = new Date()) {
  const date = new Date(now);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function average(rows) {
  const values = rows
    .map((row) => Number(row.overall))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sessionSummary(row) {
  const chapter = getChapter(row.chapter_id);
  return {
    situation: chapter?.title || row.chapter_id,
    kind: row.kind === "drill" ? "drill" : "session",
    overall: row.overall,
    weakness: row.weakness,
  };
}

function localReport({ weekRows, thisAvg, delta }) {
  const best = weekRows.reduce(
    (top, row) => (row.overall != null && (top == null || row.overall > top.overall) ? row : top),
    null,
  );
  const latest = weekRows[0];
  const headline =
    delta == null
      ? "You showed up and got scored this week. That is the whole game early on."
      : delta >= 3
        ? `Your average moved up ${delta} points this week. Something you are doing is working.`
        : delta <= -3
          ? `Your average dipped ${Math.abs(delta)} points this week. Usually that means harder situations, not worse speaking.`
          : "Your average held steady this week. Time to press the weak metric.";
  return {
    headline,
    wins: best
      ? [`Best moment: ${getChapter(best.chapter_id)?.title || best.chapter_id} at ${best.overall}.`]
      : ["You completed scored practice this week."],
    focus: latest?.weakness || "Keep answers short: point first, then one detail.",
    plan: [
      "Retry your weakest situation once and compare the score.",
      "Do one 2-minute drill on your weakest metric.",
      "Finish every answer with a concrete next step.",
    ],
  };
}

async function modelReport(payload) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are LinguaSure's coach writing a short weekly report about spoken workplace English.
Return JSON only:
{
  "headline": "one warm, specific sentence about the week",
  "wins": ["one or two concrete wins, quoting situations or scores"],
  "focus": "the single weakness to work on next week, in plain words",
  "plan": ["three short, concrete actions for next week"]
}
Be honest and specific. Use the data given. Never mention being an AI. No grammar lectures.`,
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Weekly report model request failed.");
  }
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : null,
    wins: Array.isArray(parsed.wins) ? parsed.wins.slice(0, 3) : [],
    focus: typeof parsed.focus === "string" ? parsed.focus : null,
    plan: Array.isArray(parsed.plan) ? parsed.plan.slice(0, 3) : [],
  };
}

export async function weeklyReport(user, scoredRows) {
  const weekStart = weekStartIso();
  const cached = selectReport.get(user.id, weekStart);
  if (cached) return JSON.parse(cached.report_json);

  const weekRows = scoredRows.filter((row) => row.started_at >= weekStart);
  if (!weekRows.length) return null;

  const previousRows = scoredRows.filter((row) => row.started_at < weekStart).slice(0, 15);
  const thisAvg = average(weekRows);
  const prevAvg = average(previousRows);
  const delta = thisAvg != null && prevAvg != null ? thisAvg - prevAvg : null;

  const stats = {
    weekStart,
    sessions: weekRows.length,
    average: thisAvg,
    previousAverage: prevAvg,
    delta,
  };

  let content;
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error("No API key");
    content = await modelReport({
      ...stats,
      thisWeek: weekRows.map(sessionSummary),
      earlier: previousRows.slice(0, 6).map(sessionSummary),
      metricLabels: METRIC_LABELS,
    });
    if (!content.headline) throw new Error("Empty report");
  } catch {
    content = localReport({ weekRows, thisAvg, delta });
  }

  const report = { ...stats, ...content };
  insertReport.run({
    id: randomUUID(),
    user_id: user.id,
    week_start: weekStart,
    report_json: JSON.stringify(report),
    created_at: new Date().toISOString(),
  });
  return report;
}
