export const SESSION_CAP_MS = 8 * 60 * 1000;

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
  return Math.max(0, SESSION_CAP_MS - (now - start));
}

export function isExpired(row, now = Date.now()) {
  return remainingMs(row, now) <= 0;
}
