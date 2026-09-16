export const SESSION_CAPS_MS = {
  assessment: 8 * 60 * 1000,
  practice: 5 * 60 * 1000,
  drill: 2 * 60 * 1000,
};

export function sessionKind(row) {
  if (row.kind && SESSION_CAPS_MS[row.kind]) return row.kind;
  return row.chapter_id === "assessment" ? "assessment" : "practice";
}

export function capMs(row) {
  return SESSION_CAPS_MS[sessionKind(row)];
}

const buckets = new Map();

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function rateLimit({ windowMs, max, message, keyFn = clientKey }) {
  return (req, res, next) => {
    const key = `${req.path}:${keyFn(req)}`;
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((stamp) => now - stamp < windowMs);
    if (recent.length >= max) {
      res.status(429).json({
        error: message || "Too many attempts. Wait a minute and try again.",
      });
      return;
    }
    recent.push(now);
    buckets.set(key, recent);
    next();
  };
}

export function remainingMs(row, now = Date.now()) {
  const start = Date.parse(row.talk_started_at || row.started_at || "") || now;
  return Math.max(0, capMs(row) - (now - start));
}

export function isExpired(row, now = Date.now()) {
  return remainingMs(row, now) <= 0;
}
