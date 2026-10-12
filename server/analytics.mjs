import { randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "./db.mjs";

export const PUBLIC_EVENTS = new Set([
  "landing_view",
  "cta_click",
  "login_view",
  "signup_started",
]);

const insertEvent = db.prepare(`
  INSERT INTO analytics_events (
    id, event_name, visitor_id, user_id, source, medium, campaign, content, term,
    fbclid, path, metadata_json, created_at
  ) VALUES (
    @id, @event_name, @visitor_id, @user_id, @source, @medium, @campaign, @content, @term,
    @fbclid, @path, @metadata_json, @created_at
  )
`);

const visitorAttribution = db.prepare(`
  SELECT source, medium, campaign, content, term, fbclid
  FROM analytics_events
  WHERE visitor_id = ?
    AND (source IS NOT NULL OR campaign IS NOT NULL OR fbclid IS NOT NULL)
  ORDER BY created_at ASC
  LIMIT 1
`);

function clean(value, max = 160) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export function visitorId(req) {
  return clean(req.get("x-visitor-id"), 80);
}

export function recordEvent({
  eventName,
  visitorId,
  userId = null,
  attribution = null,
  path = null,
  metadata = null,
}) {
  if (!visitorId || !eventName) return;
  const saved = visitorAttribution.get(visitorId);
  const touch = saved || attribution || {};
  insertEvent.run({
    id: randomUUID(),
    event_name: eventName,
    visitor_id: visitorId,
    user_id: userId,
    source: clean(touch.source),
    medium: clean(touch.medium),
    campaign: clean(touch.campaign),
    content: clean(touch.content),
    term: clean(touch.term),
    fbclid: clean(touch.fbclid, 300),
    path: clean(path, 300),
    metadata_json: metadata ? JSON.stringify(metadata).slice(0, 2000) : null,
    created_at: new Date().toISOString(),
  });
}

export function requireAnalyticsAdmin(req, res, next) {
  const expected = process.env.ANALYTICS_ADMIN_KEY || "";
  const received = req.get("x-analytics-key") || "";
  const valid =
    expected.length > 0 &&
    received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  if (!valid) {
    res.status(401).json({ error: "Analytics access key is invalid." });
    return;
  }
  next();
}

export function analyticsReport(days = 30) {
  const safeDays = Math.min(365, Math.max(1, Number(days) || 30));
  const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();
  const targetRate = Math.max(
    0.001,
    Math.min(1, Number(process.env.ANALYTICS_TARGET_COMPLETION_RATE || 0.05)),
  );
  const rows = db
    .prepare(`
      WITH funnel AS (
        SELECT
          COALESCE(NULLIF(campaign, ''), '(direct)') AS campaign,
          COALESCE(NULLIF(source, ''), '(direct)') AS source,
          COALESCE(NULLIF(medium, ''), '(none)') AS medium,
          COUNT(DISTINCT CASE WHEN event_name = 'landing_view' THEN visitor_id END) AS visitors,
          COUNT(DISTINCT CASE WHEN event_name = 'cta_click' THEN visitor_id END) AS cta_clicks,
          COUNT(DISTINCT CASE WHEN event_name = 'signup_completed' THEN COALESCE(user_id, visitor_id) END) AS signups,
          COUNT(DISTINCT CASE WHEN event_name = 'assessment_started' THEN COALESCE(user_id, visitor_id) END) AS starts,
          COUNT(DISTINCT CASE WHEN event_name = 'assessment_completed' THEN COALESCE(user_id, visitor_id) END) AS completions
        FROM analytics_events
        WHERE created_at >= ?
        GROUP BY 1, 2, 3
      )
      SELECT funnel.*, COALESCE(analytics_spend.amount, 0) AS spend
      FROM funnel
      LEFT JOIN analytics_spend ON analytics_spend.campaign = funnel.campaign
      ORDER BY completions DESC, signups DESC, visitors DESC
    `)
    .all(since)
    .map((row) => {
      const completionRate = row.visitors ? row.completions / row.visitors : 0;
      return {
        ...row,
        signupRate: row.visitors ? row.signups / row.visitors : 0,
        completionRate,
        costPerSignup: row.signups && row.spend ? row.spend / row.signups : null,
        costPerCompletion: row.completions && row.spend ? row.spend / row.completions : null,
        status:
          row.visitors < 100
            ? "collecting"
            : completionRate >= targetRate
              ? "on_target"
              : "below_target",
      };
    });

  const totals = rows.reduce(
    (sum, row) => {
      sum.visitors += row.visitors;
      sum.ctaClicks += row.cta_clicks;
      sum.signups += row.signups;
      sum.starts += row.starts;
      sum.completions += row.completions;
      sum.spend += row.spend;
      return sum;
    },
    { visitors: 0, ctaClicks: 0, signups: 0, starts: 0, completions: 0, spend: 0 },
  );

  return { days: safeDays, targetRate, totals, campaigns: rows };
}

export function saveCampaignSpend(campaign, amount) {
  const name = clean(campaign);
  const value = Number(amount);
  if (!name || !Number.isFinite(value) || value < 0) {
    throw new Error("Campaign and a non-negative spend are required.");
  }
  db.prepare(`
    INSERT INTO analytics_spend (campaign, amount, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(campaign) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at
  `).run(name, value, new Date().toISOString());
}
