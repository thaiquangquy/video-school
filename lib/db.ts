import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

declare global {
  var __homeschoolDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const database = new Database(DB_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

// Reused across hot-reloads in dev (Next.js clears the module cache on every
// route change but keeps globalThis), so we don't reopen the file constantly.
export const db: Database.Database = globalThis.__homeschoolDb ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalThis.__homeschoolDb = db;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    local_path TEXT,
    local_path_source TEXT CHECK (local_path_source IN ('manifest', 'auto_matched')),
    drive_url TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    duration_seconds REAL,
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS watch_progress (
    lesson_id TEXT PRIMARY KEY REFERENCES lessons(id),
    position_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    last_watched_at TEXT,
    source_last_played TEXT CHECK (source_last_played IN ('local', 'drive')),
    updated_seq INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS watch_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id TEXT NOT NULL REFERENCES lessons(id),
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('local', 'drive'))
  );

  CREATE INDEX IF NOT EXISTS idx_watch_events_lesson ON watch_events(lesson_id);
  CREATE INDEX IF NOT EXISTS idx_watch_events_started ON watch_events(started_at);
  CREATE INDEX IF NOT EXISTS idx_watch_progress_status ON watch_progress(status);
`;

/** Creates tables if they don't exist. Idempotent — safe to call on every server start. */
export function initSchema(database: Database.Database = db): void {
  database.exec(SCHEMA_SQL);
}
