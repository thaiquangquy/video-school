import { createAdminClient } from "../supabase/admin";
import { readManifest, type ManifestLesson } from "../manifest";

type ExistingLessonRow = {
  id: string;
  local_path: string | null;
  local_path_source: "manifest" | "auto_matched" | null;
};

type LessonUpsertRow = {
  id: string;
  title: string;
  subject: string;
  tags: string[];
  local_path: string | null;
  local_path_source: "manifest" | "auto_matched" | null;
  drive_url: string | null;
  order_index: number;
  archived: false;
};

/**
 * Syncs the manifest (source of truth for lesson content) into the shared
 * `lessons` table, using the admin/service-role client since this runs at
 * server startup with no user session.
 *
 * Unlike the sqlite path, this deliberately does NOT touch
 * watch_progress/enrollments/watch_events — those are per-account and are
 * created lazily via enroll() (see lib/lessons/supabase.ts), not seeded here.
 *
 * Lessons removed from the manifest are archived rather than deleted, so
 * their per-account watch history survives — same rationale as the sqlite
 * path (see lib/sync/sqlite.ts).
 */
export async function syncLessonsFromManifest(manifestPath?: string): Promise<{
  synced: number;
  archived: number;
}> {
  const manifestLessons = readManifest(manifestPath);
  const manifestIds = new Set(manifestLessons.map((l) => l.id));

  const supabase = createAdminClient();

  const { data: existingRows, error: fetchError } = await supabase
    .from("lessons")
    .select("id, local_path, local_path_source");

  if (fetchError) {
    throw new Error(`Failed to fetch existing lessons from Supabase: ${fetchError.message}`);
  }

  const existingById = new Map((existingRows as ExistingLessonRow[]).map((row) => [row.id, row]));

  const buildUpsertRow = (lesson: ManifestLesson): LessonUpsertRow => {
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

    return {
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject,
      tags: lesson.tags,
      local_path: localPath,
      local_path_source: localPathSource,
      drive_url: lesson.driveUrl,
      order_index: lesson.order,
      archived: false,
    };
  };

  if (manifestLessons.length > 0) {
    const upsertRows = manifestLessons.map(buildUpsertRow);
    const { error: upsertError } = await supabase.from("lessons").upsert(upsertRows, { onConflict: "id" });

    if (upsertError) {
      throw new Error(`Failed to upsert lessons into Supabase: ${upsertError.message}`);
    }
  }

  const removedIds = (existingRows as ExistingLessonRow[])
    .map((row) => row.id)
    .filter((id) => !manifestIds.has(id));

  if (removedIds.length > 0) {
    const { error: archiveError } = await supabase.from("lessons").update({ archived: true }).in("id", removedIds);

    if (archiveError) {
      throw new Error(`Failed to archive removed lessons in Supabase: ${archiveError.message}`);
    }
  }

  return { synced: manifestLessons.length, archived: removedIds.length };
}
