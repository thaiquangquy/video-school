// Cloud-mode (DATA_BACKEND=supabase) implementation of the lessons data
// layer. Mirrors lib/lessons/sqlite.ts's exported function names/shapes
// exactly (per lib/lessons/types.ts) so lib/lessons/index.ts can dispatch
// between the two with zero caller changes — but the persistence and
// business rules (status monotonicity, 5-minute session-gap stitching,
// per-account enrollment) live in supabase/migrations/*.sql (RPCs + views),
// not here. This file is a thin, RLS-trusting client against that schema.
//
// Always uses the session-bound client from lib/supabase/server.ts — never
// the admin/service-role client, which bypasses RLS and is reserved for the
// no-session sync/watcher paths (lib/sync/supabase.ts, lib/watcher.ts).
//
// Deliberately no explicit `.eq('user_id', ...)` filters anywhere below —
// RLS already scopes every query/RPC to auth.uid() server-side. Adding a
// redundant filter wouldn't be wrong, but relying on RLS alone is the actual
// defense-in-depth property worth preserving: a query that "forgot" to
// filter still can't leak another account's rows.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import type {
  WatchStatus,
  WatchSource,
  LessonWithProgress,
  ProgressInput,
  ContinueLearning,
  HistoryItem,
  HistorySummary,
  UnmatchedLessonCandidate,
  LessonLocalPathEntry,
} from "./types";

// --- Row shapes from supabase/migrations/0001_init.sql's views -------------

type CatalogRow = {
  id: string;
  title: string;
  subject: string;
  tags: string[];
  local_path: string | null;
  local_path_source: "manifest" | "auto_matched" | null;
  drive_url: string | null;
  order_index: number;
  duration_seconds: number | null;
  archived: boolean;
  is_enrolled: boolean;
};

type EnrolledRow = {
  id: string;
  title: string;
  subject: string;
  tags: string[];
  local_path: string | null;
  local_path_source: "manifest" | "auto_matched" | null;
  drive_url: string | null;
  order_index: number;
  duration_seconds: number | null;
  archived: boolean;
  enrolled_at: string;
  position_seconds: number | null;
  progress_duration_seconds: number | null;
  status: WatchStatus | null;
  last_watched_at: string | null;
  source_last_played: WatchSource | null;
  updated_seq: number | null;
};

// catalog_with_enrollment has no progress columns at all (a browsable lesson
// the account may not have enrolled in yet has no watch_progress row) — the
// returned `progress` is always the not_started default; `isEnrolled` is the
// field that actually carries meaning here.
function catalogRowToLesson(row: CatalogRow): LessonWithProgress {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    tags: row.tags,
    localPath: row.local_path,
    localPathSource: row.local_path_source,
    driveUrl: row.drive_url,
    orderIndex: row.order_index,
    durationSeconds: row.duration_seconds,
    progress: {
      positionSeconds: 0,
      durationSeconds: null,
      status: "not_started",
      lastWatchedAt: null,
      sourceLastPlayed: null,
    },
    isEnrolled: row.is_enrolled,
  };
}

// my_enrolled_lessons_with_progress is already scoped to lessons the account
// enrolled in (inner join on enrollments), so isEnrolled is deliberately left
// unset here — per lib/lessons/types.ts, that field is only meaningful (and
// only populated) coming out of getCatalog().
function enrolledRowToLesson(row: EnrolledRow): LessonWithProgress {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    tags: row.tags,
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

function assertNoError(context: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`[lib/lessons/supabase] ${context}: ${error.message}`);
  }
}

/**
 * Browse-all-lessons view: every non-archived catalog lesson plus whether
 * the current account has enrolled in it. There is no "all lessons" concept
 * with real content for a not-yet-enrolled lesson, so `progress` on those
 * rows is always the not_started default (see catalogRowToLesson).
 */
export async function getCatalog(): Promise<LessonWithProgress[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_with_enrollment")
    .select("*")
    .order("subject", { ascending: true })
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });
  assertNoError("getCatalog", error);
  return (data as CatalogRow[]).map(catalogRowToLesson);
}

// No standalone "all lessons" concept exists once enrollment is real (whose
// "all"?) — kept only for interface parity with sqlite.ts's getAllLessons,
// which callers written before cloud mode still invoke. Aliases to the
// catalog view, the closest cloud-mode equivalent of "every lesson."
export async function getAllLessons(): Promise<LessonWithProgress[]> {
  return getCatalog();
}

export async function getEnrolledLessons(): Promise<LessonWithProgress[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("my_enrolled_lessons_with_progress")
    .select("*")
    .order("subject", { ascending: true })
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });
  assertNoError("getEnrolledLessons", error);
  return (data as EnrolledRow[]).map(enrolledRowToLesson);
}

/**
 * Returns null both when the id doesn't exist at all AND when it exists but
 * the current account isn't enrolled in it — both cases look identical
 * through my_enrolled_lessons_with_progress's inner join, which is
 * intentional (a catalog lesson you haven't enrolled in should behave like
 * "not found" to app/watch/[id]/page.tsx, same as a truly missing id).
 */
export async function getLessonById(id: string): Promise<LessonWithProgress | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("my_enrolled_lessons_with_progress")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertNoError("getLessonById", error);
  return data ? enrolledRowToLesson(data as EnrolledRow) : null;
}

export async function enroll(lessonId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_in_lesson", { p_lesson_id: lessonId });
  assertNoError("enroll", error);
}

// Removes the enrollments row only; watch_progress/watch_events history is
// preserved server-side by the RPC — same archive-don't-delete philosophy
// the app already uses for removed manifest lessons and resets.
export async function unenroll(lessonId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unenroll_from_lesson", { p_lesson_id: lessonId });
  assertNoError("unenroll", error);
}

/**
 * Playback heartbeat. Status monotonicity ("completed" never downgrades) and
 * the 5-minute watch_events session-gap stitching both live in the
 * upsert_watch_progress plpgsql function (supabase/migrations/0001_init.sql)
 * — this just calls it and re-fetches, matching the sqlite path's return
 * shape (the updated LessonWithProgress, or null if not found/not enrolled).
 */
export async function upsertProgress(id: string, input: ProgressInput): Promise<LessonWithProgress | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_watch_progress", {
    p_lesson_id: id,
    p_position_seconds: input.positionSeconds,
    p_duration_seconds: input.durationSeconds,
    p_source: input.source,
    p_now: new Date().toISOString(),
  });
  assertNoError("upsertProgress", error);
  return getLessonById(id);
}

/**
 * Manual status override (mainly for Drive-sourced lessons). Unlike
 * upsertProgress, this is NOT monotonic — it's an explicit user action,
 * including moving a 'completed' lesson back to 'in_progress'. The plain
 * upsert here only ever writes `status`/`last_watched_at`: on an existing
 * row, position_seconds/duration_seconds/source_last_played are left
 * untouched (Postgres upsert only overwrites the columns in the payload);
 * on a brand-new row they fall back to the table's own defaults (0/NULL),
 * mirroring sqlite.ts's INSERT ... ON CONFLICT DO UPDATE SET status=... exactly.
 */
export async function markStatus(id: string, status: WatchStatus): Promise<LessonWithProgress | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("watch_progress")
    .upsert({ lesson_id: id, status, last_watched_at: new Date().toISOString() }, { onConflict: "user_id,lesson_id" });
  assertNoError("markStatus", error);
  return getLessonById(id);
}

/** Resets a lesson's tracked position/status back to not_started (does not touch watch_events history). */
export async function resetProgress(id: string): Promise<LessonWithProgress | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("watch_progress")
    .update({
      position_seconds: 0,
      duration_seconds: null,
      status: "not_started",
      last_watched_at: null,
      source_last_played: null,
    })
    .eq("lesson_id", id);
  assertNoError("resetProgress", error);
  return getLessonById(id);
}

/**
 * "Continue Learning" = most-recently-watched enrolled lesson with
 * status='in_progress' (ties broken by updated_seq, not a timestamp, same
 * reasoning as sqlite.ts). `upNext` suggests the next few enrolled lessons
 * by manifest order, skipping the continue-learning lesson and anything
 * already completed — matches sqlite.ts's exact ordering
 * (order_index, subject, id) and its "status IS NULL OR status != completed"
 * condition (a freshly-enrolled lesson may not have a watch_progress row's
 * status populated yet, though enroll_in_lesson always seeds one).
 */
export async function getContinueLearning(upNextCount = 3): Promise<ContinueLearning> {
  const supabase = await createClient();

  const { data: clRows, error: clError } = await supabase
    .from("my_enrolled_lessons_with_progress")
    .select("*")
    .eq("status", "in_progress")
    .order("updated_seq", { ascending: false })
    .limit(1);
  assertNoError("getContinueLearning (continueLearning)", clError);

  const clRow = clRows && clRows.length > 0 ? (clRows[0] as EnrolledRow) : null;
  const continueLearning = clRow ? enrolledRowToLesson(clRow) : null;

  let upNextQuery = supabase
    .from("my_enrolled_lessons_with_progress")
    .select("*")
    .or("status.is.null,status.neq.completed")
    .order("order_index", { ascending: true })
    .order("subject", { ascending: true })
    .order("id", { ascending: true })
    .limit(upNextCount);

  if (continueLearning) {
    upNextQuery = upNextQuery.neq("id", continueLearning.id);
  }

  const { data: upNextRows, error: upNextError } = await upNextQuery;
  assertNoError("getContinueLearning (upNext)", upNextError);

  return {
    continueLearning,
    upNext: (upNextRows as EnrolledRow[]).map(enrolledRowToLesson),
  };
}

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
 * Paginated, reverse-chronological watch session list, scoped to the
 * current account entirely via RLS on the underlying watch_events/
 * watch_progress tables (the watch_history view — added in
 * supabase/migrations/0002_watch_history_view.sql, since 0001 predates
 * this task — carries `security_invoker = true` so that RLS applies).
 * `position_seconds`/`duration_seconds` reflect the lesson's CURRENT
 * tracked progress, same caveat as sqlite.ts's getHistory.
 */
export async function getHistory(limit: number, offset: number): Promise<{ items: HistoryItem[]; total: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("watch_history")
    .select("*", { count: "exact" })
    .order("started_at", { ascending: false })
    .order("event_id", { ascending: false })
    .range(offset, offset + limit - 1);
  assertNoError("getHistory", error);

  const items: HistoryItem[] = (data as HistoryRow[]).map((r) => ({
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

  return { items, total: count ?? 0 };
}

type HistorySummaryRow = {
  completed_count: number | string;
  distinct_lessons_touched: number | string;
  watch_time_this_week_seconds: number | string;
};

/** Stats for the History page's summary strip, via the get_history_summary() RPC. */
export async function getHistorySummary(): Promise<HistorySummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_history_summary");
  assertNoError("getHistorySummary", error);

  // get_history_summary() is declared `returns table (...)`, so PostgREST
  // always hands back an array (one row, since it's aggregate-only); guard
  // defensively in case that ever changes, and Number() the bigint columns
  // since Postgres bigint can come back over the wire as a string.
  const row: HistorySummaryRow | undefined = Array.isArray(data) ? data[0] : (data as HistorySummaryRow | undefined);

  return {
    completedCount: Number(row?.completed_count ?? 0),
    distinctLessonsTouched: Number(row?.distinct_lessons_touched ?? 0),
    watchTimeThisWeekSeconds: Number(row?.watch_time_this_week_seconds ?? 0),
  };
}

// --- lib/watcher.ts dispatch surface ----------------------------------
// Unlike everything above, these use the admin/service-role client
// (lib/supabase/admin.ts), not the session-bound one — the watcher runs at
// server startup/on filesystem events with no user session to bind to, and
// `lessons` is a shared catalog table (no per-account RLS concern), same
// rationale as lib/sync/supabase.ts.

type LessonPathRow = { id: string; local_path: string | null };

export async function getUnmatchedLessons(): Promise<UnmatchedLessonCandidate[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("id, title")
    .is("local_path", null)
    .eq("archived", false);
  assertNoError("getUnmatchedLessons", error);
  return data as UnmatchedLessonCandidate[];
}

export async function getLessonsWithLocalPath(): Promise<LessonLocalPathEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("id, local_path")
    .not("local_path", "is", null)
    .eq("archived", false);
  assertNoError("getLessonsWithLocalPath", error);
  return (data as LessonPathRow[]).map((row) => ({ id: row.id, localPath: row.local_path as string }));
}

export async function setLocalPath(lessonId: string, localPath: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .update({ local_path: localPath, local_path_source: "auto_matched" })
    .eq("id", lessonId);
  assertNoError("setLocalPath", error);
}

export async function clearLocalPath(lessonId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .update({ local_path: null, local_path_source: null })
    .eq("id", lessonId);
  assertNoError("clearLocalPath", error);
}
