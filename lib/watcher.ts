import path from "node:path";
import fs from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import { db } from "./db";
import { matchFileToLesson, normalize, stripExtension, type MatchCandidateLesson } from "./videoMatch";

export const VIDEOS_DIR = path.join(process.cwd(), "data", "videos");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"]);

function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Resolves a lesson's stored local_path (relative or absolute) to an absolute path. */
export function resolveLocalPath(localPath: string): string {
  return path.isAbsolute(localPath) ? localPath : path.join(VIDEOS_DIR, localPath);
}

function getUnmatchedLessons(): MatchCandidateLesson[] {
  const rows = db
    .prepare("SELECT id, title FROM lessons WHERE local_path IS NULL AND archived = 0")
    .all() as MatchCandidateLesson[];
  return rows;
}

/**
 * Finds the lesson (if any) whose local_path already resolves to this exact
 * file, regardless of whether that path is stored relative (manifest) or
 * absolute (auto_matched).
 */
function findLessonByResolvedPath(filePath: string): { id: string } | undefined {
  const rows = db
    .prepare("SELECT id, local_path FROM lessons WHERE local_path IS NOT NULL AND archived = 0")
    .all() as { id: string; local_path: string }[];
  return rows.find((row) => resolveLocalPath(row.local_path) === filePath);
}

// Prepared lazily (not at module load) since this module can be imported
// before initSchema() has created the tables — see instrumentation.ts.
function setLocalPath(filePath: string, lessonId: string): void {
  db.prepare("UPDATE lessons SET local_path = ?, local_path_source = 'auto_matched' WHERE id = ?").run(
    filePath,
    lessonId,
  );
}

function clearLocalPath(lessonId: string): void {
  db.prepare("UPDATE lessons SET local_path = NULL, local_path_source = NULL WHERE id = ?").run(lessonId);
}

/** Handles a newly-seen video file: matches it to an unmatched lesson, or logs it as unmatched. */
export function handleNewVideoFile(filePath: string): void {
  if (!isVideoFile(filePath)) return;

  // Already linked (typically via the manifest's localPath) — nothing to
  // match, and logging it as "unmatched" would be misleading.
  if (findLessonByResolvedPath(filePath)) return;

  const filename = path.basename(filePath);
  const normalizedFilename = normalize(stripExtension(filename));
  const candidates = getUnmatchedLessons();

  if (candidates.length === 0) {
    console.warn(`[watcher] Unmatched video file "${filename}" — no lessons currently need a local file.`);
    return;
  }

  const result = matchFileToLesson(normalizedFilename, candidates);

  if (result.kind === "matched") {
    setLocalPath(filePath, result.lesson.id);
    console.log(
      `[watcher] Matched "${filename}" -> lesson "${result.lesson.id}" (${result.reason}), local_path set.`,
    );
    return;
  }

  if (result.kind === "ambiguous") {
    console.warn(
      `[watcher] Unmatched video file "${filename}" — matched multiple lessons ambiguously: ` +
        `${result.lessons.map((l) => l.id).join(", ")}. Left unmatched; rename the file or fix lesson ids/titles.`,
    );
    return;
  }

  console.warn(`[watcher] Unmatched video file "${filename}" — no lesson id/title matched it.`);
}

/** Clears a lesson's local_path if the file it points to no longer exists on disk. */
export function handleRemovedVideoFile(filePath: string): void {
  const row = findLessonByResolvedPath(filePath);

  if (!row) return;

  clearLocalPath(row.id);
  console.warn(
    `[watcher] Video file for lesson "${row.id}" (${path.basename(filePath)}) was removed — local_path cleared, ` +
      "falling back to driveUrl if present.",
  );
}

/** Checks every lesson with a local_path against disk and clears any that point at missing files. */
export function pruneMissingLocalFiles(): void {
  const rows = db
    .prepare("SELECT id, local_path FROM lessons WHERE local_path IS NOT NULL AND archived = 0")
    .all() as { id: string; local_path: string }[];

  for (const row of rows) {
    const absolutePath = resolveLocalPath(row.local_path);
    if (!fs.existsSync(absolutePath)) {
      clearLocalPath(row.id);
      console.warn(
        `[watcher] Lesson "${row.id}" pointed at a missing file (${row.local_path}) — local_path cleared, ` +
          "falling back to driveUrl if present.",
      );
    }
  }
}

let watcherInstance: FSWatcher | null = null;

/**
 * Starts the folder watcher (idempotent — safe to call once per server
 * process). Prunes stale local_paths first, then does a chokidar-driven
 * initial scan of data/videos (covers files dropped in while the server was
 * down) followed by ongoing add/unlink watching.
 */
export function startVideoWatcher(): FSWatcher {
  if (watcherInstance) return watcherInstance;

  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  pruneMissingLocalFiles();

  const watcher = chokidar.watch(VIDEOS_DIR, {
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200,
    },
  });

  watcher.on("add", (filePath) => handleNewVideoFile(filePath));
  watcher.on("unlink", (filePath) => handleRemovedVideoFile(filePath));
  watcher.on("error", (err) => console.error("[watcher] chokidar error:", err));

  watcherInstance = watcher;
  console.log(`[watcher] Watching ${VIDEOS_DIR} for video files.`);
  return watcher;
}
