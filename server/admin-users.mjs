import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
const dbPath = join(dataDir, "linguasure.sqlite");

if (!existsSync(dbPath)) {
  console.error(`Database not found at: ${dbPath}`);
  console.error("Set DATA_DIR correctly on the server and try again.");
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

function scalar(sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
}

function countActive(windowExpr) {
  return (
    scalar(
      `
      SELECT COUNT(DISTINCT user_id)
      FROM practice_sessions
      WHERE datetime(started_at) >= datetime('now', ?)
    `,
      windowExpr,
    ) || 0
  );
}

const totalUsers = scalar("SELECT COUNT(*) FROM users") || 0;
const usersWithSessions = scalar(
  "SELECT COUNT(DISTINCT user_id) FROM practice_sessions",
) || 0;
const liveNow = scalar(
  "SELECT COUNT(DISTINCT user_id) FROM practice_sessions WHERE status = 'live'",
) || 0;
const active24h = countActive("-1 day");
const active7d = countActive("-7 days");
const active30d = countActive("-30 days");

const userRows = db
  .prepare(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.created_at AS joined_at,
      COUNT(s.id) AS sessions_total,
      SUM(CASE WHEN s.status = 'scored' THEN 1 ELSE 0 END) AS scored_sessions,
      MAX(COALESCE(s.ended_at, s.started_at)) AS last_seen
    FROM users u
    LEFT JOIN practice_sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY (last_seen IS NULL), datetime(last_seen) DESC
  `,
  )
  .all()
  .map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    joinedAt: row.joined_at,
    sessions: Number(row.sessions_total || 0),
    scored: Number(row.scored_sessions || 0),
    lastSeen: row.last_seen || "never",
  }));

console.log("\nLinguaSure user stats");
console.log("====================");
console.log(`DB: ${dbPath}`);
console.log(`Total users: ${totalUsers}`);
console.log(`Users with any session: ${usersWithSessions}`);
console.log(`Active now (live): ${liveNow}`);
console.log(`Active in last 24h: ${active24h}`);
console.log(`Active in last 7d: ${active7d}`);
console.log(`Active in last 30d: ${active30d}`);

console.log("\nUser list");
console.log("---------");
if (userRows.length === 0) {
  console.log("No users found.");
} else {
  console.table(userRows);
}

db.close();
