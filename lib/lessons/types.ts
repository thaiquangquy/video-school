// Shared types for the lessons data layer, used by both the sqlite backend
// (lib/lessons/sqlite.ts) and — from task 11 onward — the supabase backend
// (lib/lessons/supabase.ts). Keeping these here (rather than duplicated per
// backend) is what lets lib/lessons/index.ts dispatch between backends
// behind a single stable interface.

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
  // Only populated by getCatalog() — in supabase mode this reflects whether
  // the current account has enrolled in the lesson; local sqlite mode has no
  // enrollment concept, so getCatalog() there always sets this true.
  isEnrolled?: boolean;
};

export type ProgressInput = {
  positionSeconds: number;
  durationSeconds: number | null;
  source: WatchSource;
};

export type ContinueLearning = {
  continueLearning: LessonWithProgress | null;
  upNext: LessonWithProgress[];
};

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

export type HistorySummary = {
  completedCount: number;
  distinctLessonsTouched: number;
  watchTimeThisWeekSeconds: number;
};

// --- lib/watcher.ts support --------------------------------------------
// The watcher (chokidar-driven local-file matching) touches only the
// shared `lessons` table's id/title/local_path columns — never
// watch_progress/watch_events/enrollments — so these are intentionally
// narrower than LessonWithProgress. Kept here (not in lib/videoMatch.ts)
// so lib/lessons doesn't depend on lib/videoMatch; the shape below is
// structurally identical to videoMatch.ts's MatchCandidateLesson, so
// getUnmatchedLessons() results can be passed straight into
// matchFileToLesson() without conversion.

/** Minimal lesson shape the file-matching algorithm needs: id + title. */
export type UnmatchedLessonCandidate = {
  id: string;
  title: string;
};

/** A lesson that currently has a local_path set. */
export type LessonLocalPathEntry = {
  id: string;
  localPath: string;
};
