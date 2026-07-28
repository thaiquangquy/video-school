import type Database from "better-sqlite3";
import { db } from "./db";

export type WatchStatus = "not_started" | "in_progress" | "completed";
export type WatchSource = "local" | "drive";

export type LessonWithProgress = {
  id: string;
  title: string;
  subject: string;
  tags: string[];
  localPath: string | null;
  localPathSource: "manifest" | "auto_matched" | null;
  driveUrl: string | null;
  orderIndex: number;
  durationSeconds: number | null;
  progress: {
    positionSeconds: number;
    durationSeconds: number | null;
    status: WatchStatus;
    lastWatchedAt: string | null;
    sourceLastPlayed: WatchSource | null;
  };
};

type LessonRow = {
  id: string;
  title: string;
  subject: string;
  tags: string;
  local_path: string | null;
  local_path_source: "manifest" | "auto_matched" | null;
  drive_url: string | null;
  order_index: number;
  duration_seconds: number | null;
  position_seconds: number | null;
  progress_duration_seconds: number | null;
  status: WatchStatus | null;
  last_watched_at: string | null;
  source_last_played: WatchSource | null;
};

const LESSON_WITH_PROGRESS_SELECT = `
  SELECT
    l.id, l.title, l.subject, l.tags, l.local_path, l.local_path_source, l.drive_url,
    l.order_index, l.duration_seconds,
    p.position_seconds, p.duration_seconds AS progress_duration_seconds,
    p.status, p.last_watched_at, p.source_last_played
  FROM lessons l
  LEFT JOIN watch_progress p ON p.lesson_id = l.id
`;

function rowToLesson(row: LessonRow): LessonWithProgress {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    tags: JSON.parse(row.tags) as string[],
    localPath: row.local_path,
    localPathSource: row.local_path_source,
    driveUrl: row.drive_url,
    orderIndex: row.order_index,
    durationSeconds: row.duration_seconds,
    progress: {
      positionSeconds: row.position_seconds ?? 0,
      durationSeconds: row.progress_duration_seconds,
      status: row.status ?? "not_started",
      lastWatchedAt: row.last_watched_at,
      sourceLastPlayed: row.source_last_played,
    },
  };
}

export function getAllLessons(database: Database.Database = db): LessonWithProgress[] {
  const rows = database
    .prepare(`${LESSON_WITH_PROGRESS_SELECT} WHERE l.archived = 0 ORDER BY l.subject ASC, l.order_index ASC, l.id ASC`)
    .all() as LessonRow[];
  return rows.map(rowToLesson);
}

export function getLessonById(id: string, database: Database.Database = db): LessonWithProgress | null {
  const row = database.prepare(`${LESSON_WITH_PROGRESS_SELECT} WHERE l.id = ? AND l.archived = 0`).get(id) as
    | LessonRow
    | undefined;
  return row ? rowToLesson(row) : null;
}

export type ProgressInput = {
  positionSeconds: number;
  durationSeconds: number | null;
  source: WatchSource;
};

const COMPLETION_THRESHOLD = 0.95;
const NEW_SESSION_GAP_MS = 5 * 60 * 1000;

/**
 * ISO timestamps only carry millisecond resolution, so two heartbeats landing
 * in the same millisecond would otherwise tie in "most recently watched"
 * ordering. This monotonic counter breaks ties deterministically.
 */
function nextUpdatedSeq(database: Database.Database): number {
  const row = database.prepare("SELECT COALESCE(MAX(updated_seq), 0) AS maxSeq FROM watch_progress").get() as {
    maxSeq: number;
  };
  return row.maxSeq + 1;
}

/**
 * Upserts watch_progress for a heartbeat and appends/extends a watch_events
 * session row. Status is monotonic once 'completed': a later heartbeat with
 * a lower position (e.g. she rewound to review something) never downgrades
 * it back to 'in_progress' — "Continue Learning" must never resurface a
 * finished lesson, even mid-rewatch.
 */
export function upsertProgress(
  id: string,
  input: ProgressInput,
  database: Database.Database = db,
): LessonWithProgress | null {
  const lesson = getLessonById(id, database);
  if (!lesson) return null;

  const existing = database.prepare("SELECT status FROM watch_progress WHERE lesson_id = ?").get(id) as
    | { status: WatchStatus }
    | undefined;

  const now = new Date().toISOString();
  const { positionSeconds, durationSeconds, source } = input;

  let status: WatchStatus;
  if (durationSeconds && durationSeconds > 0 && positionSeconds >= durationSeconds * COMPLETION_THRESHOLD) {
    status = "completed";
  } else {
    status = "in_progress";
  }
  if (existing?.status === "completed") {
    status = "completed";
  }

  const runUpdate = database.transaction(() => {
    const seq = nextUpdatedSeq(database);

    database
      .prepare(
        `INSERT INTO watch_progress (lesson_id, position_seconds, duration_seconds, status, last_watched_at, source_last_played, updated_seq)
         VALUES (@id, @position, @duration, @status, @now, @source, @seq)
         ON CONFLICT(lesson_id) DO UPDATE SET
           position_seconds = excluded.position_seconds,
           duration_seconds = excluded.duration_seconds,
           status = excluded.status,
           last_watched_at = excluded.last_watched_at,
           source_last_played = excluded.source_last_played,
           updated_seq = excluded.updated_seq`,
      )
      .run({ id, position: positionSeconds, duration: durationSeconds, status, now, source, seq });

    const openEvent = database
      .prepare("SELECT id, ended_at FROM watch_events WHERE lesson_id = ? ORDER BY id DESC LIMIT 1")
      .get(id) as { id: number; ended_at: string } | undefined;

    const gapMs = openEvent ? Date.now() - new Date(openEvent.ended_at).getTime() : Infinity;

    if (openEvent && gapMs <= NEW_SESSION_GAP_MS) {
      database.prepare("UPDATE watch_events SET ended_at = ?, source = ? WHERE id = ?").run(now, source, openEvent.id);
    } else {
      database
        .prepare("INSERT INTO watch_events (lesson_id, started_at, ended_at, source) VALUES (?, ?, ?, ?)")
        .run(id, now, now, source);
    }
  });

  runUpdate();

  return getLessonById(id, database);
}

/** Manual status override (mainly for Drive-sourced lessons). Unlike upsertProgress, this is NOT monotonic — it's an explicit user action, including resets. */
export function markStatus(id: string, status: WatchStatus, database: Database.Database = db): LessonWithProgress | null {
  const lesson = getLessonById(id, database);
  if (!lesson) return null;

  const now = new Date().toISOString();
  const seq = nextUpdatedSeq(database);

  database
    .prepare(
      `INSERT INTO watch_progress (lesson_id, position_seconds, duration_seconds, status, last_watched_at, source_last_played, updated_seq)
       VALUES (@id, 0, NULL, @status, @now, NULL, @seq)
       ON CONFLICT(lesson_id) DO UPDATE SET
         status = excluded.status,
         last_watched_at = excluded.last_watched_at,
         updated_seq = excluded.updated_seq`,
    )
    .run({ id, status, now, seq });

  return getLessonById(id, database);
}

/** Resets a lesson's tracked position/status back to not_started (does not touch watch_events history). */
export function resetProgress(id: string, database: Database.Database = db): LessonWithProgress | null {
  const lesson = getLessonById(id, database);
  if (!lesson) return null;

  database
    .prepare(
      `UPDATE watch_progress SET position_seconds = 0, duration_seconds = NULL, status = 'not_started', last_watched_at = NULL, source_last_played = NULL
       WHERE lesson_id = ?`,
    )
    .run(id);

  return getLessonById(id, database);
}

export type ContinueLearning = {
  continueLearning: LessonWithProgress | null;
  upNext: LessonWithProgress[];
};

/**
 * "Continue Learning" = most-recently-watched lesson with status='in_progress'.
 * Completed lessons are excluded, full stop — no tie-break logic, no
 * exception for rewatching. `upNext` suggests the next 2-3 lessons by
 * manifest order, skipping the continue-learning lesson and anything already
 * completed.
 */
export function getContinueLearning(database: Database.Database = db, upNextCount = 3): ContinueLearning {
  const row = database
    .prepare(`${LESSON_WITH_PROGRESS_SELECT} WHERE l.archived = 0 AND p.status = 'in_progress' ORDER BY p.updated_seq DESC LIMIT 1`)
    .get() as LessonRow | undefined;

  const continueLearning = row ? rowToLesson(row) : null;

  const upNextRows = database
    .prepare(
      `${LESSON_WITH_PROGRESS_SELECT}
       WHERE l.archived = 0
         AND (p.status IS NULL OR p.status != 'completed')
         AND l.id != @excludeId
       ORDER BY l.order_index ASC, l.subject ASC, l.id ASC
       LIMIT @limit`,
    )
    .all({ excludeId: continueLearning?.id ?? "", limit: upNextCount }) as LessonRow[];

  return { continueLearning, upNext: upNextRows.map(rowToLesson) };
}

export type HistoryItem = {
  eventId: number;
  lessonId: string;
  title: string;
  subject: string;
  source: WatchSource;
  startedAt: string;
  endedAt: string;
  positionSeconds: number | null;
  durationSeconds: number | null;
};

type HistoryRow = {
  event_id: number;
  lesson_id: string;
  title: string;
  subject: string;
  source: WatchSource;
  started_at: string;
  ended_at: string;
  position_seconds: number | null;
  duration_seconds: number | null;
};

/**
 * Paginated, reverse-chronological watch session list. `position_seconds` /
 * `duration_seconds` reflect the lesson's CURRENT tracked progress (the
 * schema doesn't store a per-session position snapshot) rather than the
 * exact position at that specific session's end.
 */
export function getHistory(
  limit: number,
  offset: number,
  database: Database.Database = db,
): { items: HistoryItem[]; total: number } {
  const rows = database
    .prepare(
      `SELECT
         e.id AS event_id, e.lesson_id, l.title, l.subject, e.source, e.started_at, e.ended_at,
         p.position_seconds, p.duration_seconds
       FROM watch_events e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN watch_progress p ON p.lesson_id = e.lesson_id
       WHERE l.archived = 0
       ORDER BY e.started_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as HistoryRow[];

  const { count } = database
    .prepare(
      `SELECT COUNT(*) AS count FROM watch_events e JOIN lessons l ON l.id = e.lesson_id WHERE l.archived = 0`,
    )
    .get() as { count: number };

  const items: HistoryItem[] = rows.map((r) => ({
    eventId: r.event_id,
    lessonId: r.lesson_id,
    title: r.title,
    subject: r.subject,
    source: r.source,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    positionSeconds: r.position_seconds,
    durationSeconds: r.duration_seconds,
  }));

  return { items, total: count };
}

export type HistorySummary = {
  completedCount: number;
  distinctLessonsTouched: number;
  watchTimeThisWeekSeconds: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Stats for the History page's summary strip. "This week" = the last 7 days, not calendar week. */
export function getHistorySummary(database: Database.Database = db): HistorySummary {
  const { completedCount } = database
    .prepare(
      `SELECT COUNT(*) AS completedCount
       FROM watch_progress p
       JOIN lessons l ON l.id = p.lesson_id
       WHERE l.archived = 0 AND p.status = 'completed'`,
    )
    .get() as { completedCount: number };

  const { distinctLessonsTouched } = database
    .prepare(
      `SELECT COUNT(*) AS distinctLessonsTouched
       FROM watch_progress p
       JOIN lessons l ON l.id = p.lesson_id
       WHERE l.archived = 0 AND p.status != 'not_started'`,
    )
    .get() as { distinctLessonsTouched: number };

  const sevenDaysAgo = new Date(Date.now() - WEEK_MS).toISOString();
  const { watchTimeThisWeekSeconds } = database
    .prepare(
      `SELECT COALESCE(SUM((julianday(e.ended_at) - julianday(e.started_at)) * 86400), 0) AS watchTimeThisWeekSeconds
       FROM watch_events e
       JOIN lessons l ON l.id = e.lesson_id
       WHERE l.archived = 0 AND e.started_at >= ?`,
    )
    .get(sevenDaysAgo) as { watchTimeThisWeekSeconds: number };

  return { completedCount, distinctLessonsTouched, watchTimeThisWeekSeconds };
}
