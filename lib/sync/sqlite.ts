import { db } from "../db";
import { readManifest, type ManifestLesson } from "../manifest";

type ExistingLessonRow = {
  id: string;
  local_path: string | null;
  local_path_source: "manifest" | "auto_matched" | null;
};

/**
 * Syncs the manifest (source of truth for lesson content) into the `lessons`
 * table, and ensures every lesson has a `watch_progress` row.
 *
 * Lessons removed from the manifest are archived rather than deleted, so
 * their watch_progress/watch_events history survives — the Library/Home/
 * History queries just filter out archived lessons. This is simpler than
 * cascading deletes and keeps watch history intact if a lesson id ever
 * comes back to the manifest later.
 */
export async function syncLessonsFromManifest(manifestPath?: string): Promise<{
  synced: number;
  archived: number;
}> {
  const manifestLessons = readManifest(manifestPath);
  const manifestIds = new Set(manifestLessons.map((l) => l.id));

  const existingRows = db.prepare("SELECT id, local_path, local_path_source FROM lessons").all() as ExistingLessonRow[];
  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  const upsertLesson = db.prepare(`
    INSERT INTO lessons (id, title, subject, tags, local_path, local_path_source, drive_url, order_index, archived)
    VALUES (@id, @title, @subject, @tags, @local_path, @local_path_source, @drive_url, @order_index, 0)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      subject = excluded.subject,
      tags = excluded.tags,
      local_path = excluded.local_path,
      local_path_source = excluded.local_path_source,
      drive_url = excluded.drive_url,
      order_index = excluded.order_index,
      archived = 0
  `);

  const insertProgressIfMissing = db.prepare(`
    INSERT INTO watch_progress (lesson_id, position_seconds, duration_seconds, status, last_watched_at, source_last_played)
    VALUES (?, 0, NULL, 'not_started', NULL, NULL)
    ON CONFLICT(lesson_id) DO NOTHING
  `);

  const archiveLesson = db.prepare("UPDATE lessons SET archived = 1 WHERE id = ?");

  const applyManifestEntry = (lesson: ManifestLesson) => {
    const existing = existingById.get(lesson.id);

    // Manifest is authoritative for content fields. For localPath: if the
    // manifest doesn't specify one but the watcher already auto-matched a
    // file, keep the auto-matched value instead of clobbering it with null.
    let localPath = lesson.localPath;
    let localPathSource: "manifest" | "auto_matched" | null = lesson.localPath ? "manifest" : null;

    if (!lesson.localPath && existing?.local_path && existing.local_path_source === "auto_matched") {
      localPath = existing.local_path;
      localPathSource = "auto_matched";
    }

    upsertLesson.run({
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject,
      tags: JSON.stringify(lesson.tags),
      local_path: localPath,
      local_path_source: localPathSource,
      drive_url: lesson.driveUrl,
      order_index: lesson.order,
    });

    insertProgressIfMissing.run(lesson.id);
  };

  const runSync = db.transaction((lessons: ManifestLesson[]) => {
    for (const lesson of lessons) {
      applyManifestEntry(lesson);
    }

    let archivedCount = 0;
    for (const row of existingRows) {
      if (!manifestIds.has(row.id)) {
        archiveLesson.run(row.id);
        archivedCount++;
      }
    }

    return archivedCount;
  });

  const archivedCount = runSync(manifestLessons);

  return { synced: manifestLessons.length, archived: archivedCount };
}
