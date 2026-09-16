import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, "linguasure.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    picture TEXT,
    password_hash TEXT,
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

  CREATE TABLE IF NOT EXISTS pending_signups (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    last_sent_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weekly_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, week_start),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

migrateUsers();
migrateProgress();

function migrateUsers() {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  if (columns.length === 0) return;

  const names = new Set(columns.map((column) => column.name));
  const google = columns.find((column) => column.name === "google_id");
  const emailUnique = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get()?.sql?.includes("email TEXT NOT NULL UNIQUE");

  if (!names.has("password_hash") || google?.notnull === 1 || !emailUnique) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE users_migrated (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        picture TEXT,
        password_hash TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO users_migrated (id, google_id, email, name, picture, password_hash, created_at)
      SELECT
        id,
        google_id,
        email,
        name,
        picture,
        ${names.has("password_hash") ? "password_hash" : "NULL"},
        created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_migrated RENAME TO users;
    `);
    db.pragma("foreign_keys = ON");
  }
}

function migrateProgress() {
  const columns = new Set(
    db.prepare("PRAGMA table_info(users)").all().map((column) => column.name),
  );
  if (!columns.has("unlock_metric")) {
    db.exec("ALTER TABLE users ADD COLUMN unlock_metric TEXT");
  }
  if (!columns.has("unlock_threshold")) {
    db.exec("ALTER TABLE users ADD COLUMN unlock_threshold INTEGER");
  }
  if (!columns.has("topic_order")) {
    db.exec("ALTER TABLE users ADD COLUMN topic_order TEXT");
  }
  if (!columns.has("unlock_thresholds")) {
    db.exec("ALTER TABLE users ADD COLUMN unlock_thresholds TEXT");
  }
  if (!columns.has("focus_area")) {
    db.exec("ALTER TABLE users ADD COLUMN focus_area TEXT");
  }
  if (!columns.has("program_id")) {
    db.exec("ALTER TABLE users ADD COLUMN program_id TEXT");
  }
  if (!columns.has("program_started_at")) {
    db.exec("ALTER TABLE users ADD COLUMN program_started_at TEXT");
  }
}

migrateSessions();

function migrateSessions() {
  const columns = new Set(
    db.prepare("PRAGMA table_info(practice_sessions)").all().map((column) => column.name),
  );
  if (!columns.size) return;
  if (!columns.has("talk_started_at")) {
    db.exec("ALTER TABLE practice_sessions ADD COLUMN talk_started_at TEXT");
  }
  if (!columns.has("difficulty_mode")) {
    db.exec("ALTER TABLE practice_sessions ADD COLUMN difficulty_mode TEXT");
  }
  if (!columns.has("kind")) {
    db.exec("ALTER TABLE practice_sessions ADD COLUMN kind TEXT");
  }
  if (!columns.has("focus")) {
    db.exec("ALTER TABLE practice_sessions ADD COLUMN focus TEXT");
  }
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    focusArea: row.focus_area || null,
  };
}
