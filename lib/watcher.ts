import path from "node:path";
import fs from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import { readConfig } from "./config";
import { matchFileToLesson, normalize, stripExtension } from "./videoMatch";
import { getUnmatchedLessons, getLessonsWithLocalPath, setLocalPath, clearLocalPath } from "./lessons";

function resolveVideosDir(): string {
  const { videosDir } = readConfig();
  if (!videosDir) return path.join(process.cwd(), "data", "videos");
  return path.isAbsolute(videosDir) ? videosDir : path.join(process.cwd(), videosDir);
}

// Resolved once per process from data/config.yaml's `videosDir` (falls back
// to data/videos/ if unset) — not re-read per request, matching the previous
// hardcoded-constant behavior/cost.
export const VIDEOS_DIR = resolveVideosDir();

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"]);

function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Resolves a lesson's stored local_path (relative or absolute) to an absolute path. */
export function resolveLocalPath(localPath: string): string {
  return path.isAbsolute(localPath) ? localPath : path.join(VIDEOS_DIR, localPath);
}

/**
 * Finds the lesson (if any) whose local_path already resolves to this exact
 * file, regardless of whether that path is stored relative (manifest) or
 * absolute (auto_matched). All persistence goes through lib/lessons's
 * dispatched helpers (task 13) — this module never talks to better-sqlite3
 * or the Supabase client directly.
 */
async function findLessonByResolvedPath(filePath: string): Promise<{ id: string } | undefined> {
  const rows = await getLessonsWithLocalPath();
  return rows.find((row) => resolveLocalPath(row.localPath) === filePath);
}

/** Handles a newly-seen video file: matches it to an unmatched lesson, or logs it as unmatched. */
export async function handleNewVideoFile(filePath: string): Promise<void> {
  if (!isVideoFile(filePath)) return;

  // Already linked (typically via the manifest's localPath) — nothing to
  // match, and logging it as "unmatched" would be misleading.
  if (await findLessonByResolvedPath(filePath)) return;

  const filename = path.basename(filePath);
  const normalizedFilename = normalize(stripExtension(filename));
  const candidates = await getUnmatchedLessons();

  if (candidates.length === 0) {
    console.warn(`[watcher] Unmatched video file "${filename}" — no lessons currently need a local file.`);
    return;
  }

  const result = matchFileToLesson(normalizedFilename, candidates);

  if (result.kind === "matched") {
    await setLocalPath(result.lesson.id, filePath);
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
export async function handleRemovedVideoFile(filePath: string): Promise<void> {
  const row = await findLessonByResolvedPath(filePath);

  if (!row) return;

  await clearLocalPath(row.id);
  console.warn(
    `[watcher] Video file for lesson "${row.id}" (${path.basename(filePath)}) was removed — local_path cleared, ` +
      "falling back to driveUrl if present.",
  );
}

/** Checks every lesson with a local_path against disk and clears any that point at missing files. */
export async function pruneMissingLocalFiles(): Promise<void> {
  const rows = await getLessonsWithLocalPath();

  for (const row of rows) {
    const absolutePath = resolveLocalPath(row.localPath);
    if (!fs.existsSync(absolutePath)) {
      await clearLocalPath(row.id);
      console.warn(
        `[watcher] Lesson "${row.id}" pointed at a missing file (${row.localPath}) — local_path cleared, ` +
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
export async function startVideoWatcher(): Promise<FSWatcher | null> {
  if (watcherInstance) return watcherInstance;

  // No-op if VIDEOS_DIR already exists (e.g. an externally-managed folder
  // like a Google Drive Desktop sync target) — only creates it when it's the
  // default data/videos/ and hasn't been created yet. A configured videosDir
  // can point somewhere this process can't create/reach (e.g. a host-only
  // path baked into data/config.yaml but run inside a container without
  // that path mounted) — that shouldn't take the whole server down; log and
  // skip watching instead. pruneMissingLocalFiles() below still runs and
  // safely clears any local_path that turns out to be unreachable.
  try {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  } catch (err) {
    console.error(
      `[watcher] Could not create/access videos directory "${VIDEOS_DIR}" — local video playback and ` +
        "auto-matching are unavailable until this path is reachable. Underlying error:",
      err,
    );
    await pruneMissingLocalFiles();
    return null;
  }

  await pruneMissingLocalFiles();

  const watcher = chokidar.watch(VIDEOS_DIR, {
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200,
    },
  });

  watcher.on("add", (filePath) => {
    handleNewVideoFile(filePath).catch((err) => console.error(`[watcher] Error handling new file "${filePath}":`, err));
  });
  watcher.on("unlink", (filePath) => {
    handleRemovedVideoFile(filePath).catch((err) =>
      console.error(`[watcher] Error handling removed file "${filePath}":`, err),
    );
  });
  watcher.on("error", (err) => console.error("[watcher] chokidar error:", err));

  watcherInstance = watcher;
  console.log(`[watcher] Watching ${VIDEOS_DIR} for video files.`);
  return watcher;
}
