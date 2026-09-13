import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, "linguasure.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    transcript_json TEXT,
    timings_json TEXT,
    scores_json TEXT,
    weakness TEXT,
    next_focus TEXT,
    overall INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_started
    ON practice_sessions (user_id, started_at DESC);
`);

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
  };
}
