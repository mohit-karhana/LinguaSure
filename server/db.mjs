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
`);

migrateUsers();

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

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
  };
}
