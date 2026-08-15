import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function clearCachedDbConnection() {
  delete (globalThis as unknown as { __homeschoolDb?: unknown }).__homeschoolDb;
}

function writeManifest(dir: string, contents: string): string {
  const file = path.join(dir, "lessons.yaml");
  fs.writeFileSync(file, contents);
  return file;
}

describe("syncLessonsFromManifest (sqlite)", () => {
  let tmpDir: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    vi.resetModules();
    clearCachedDbConnection();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-school-sync-test-"));
    process.env.DB_PATH = path.join(tmpDir, "app.db");
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    clearCachedDbConnection();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inserts lessons and a not_started watch_progress row for each on first sync", async () => {
    const { initSchema, db } = await import("@/lib/db");
    initSchema();
    const { syncLessonsFromManifest } = await import("@/lib/sync/sqlite");

    const manifest = writeManifest(
      tmpDir,
      `
- id: lesson-1
  title: Lesson One
  subject: Math
  order: 1
- id: lesson-2
  title: Lesson Two
  subject: Math
  order: 2
  localPath: "2.mp4"
`,
    );

    const result = await syncLessonsFromManifest(manifest);
    expect(result).toEqual({ synced: 2, archived: 0 });

    const lessons = db.prepare("SELECT id, local_path, local_path_source FROM lessons ORDER BY id").all();
    expect(lessons).toEqual([
      { id: "lesson-1", local_path: null, local_path_source: null },
      { id: "lesson-2", local_path: "2.mp4", local_path_source: "manifest" },
    ]);

    const progressRows = db.prepare("SELECT lesson_id, status FROM watch_progress ORDER BY lesson_id").all();
    expect(progressRows).toEqual([
      { lesson_id: "lesson-1", status: "not_started" },
      { lesson_id: "lesson-2", status: "not_started" },
    ]);
  });

  it("archives lessons removed from the manifest without touching their progress", async () => {
    const { initSchema, db } = await import("@/lib/db");
    initSchema();
    const { syncLessonsFromManifest } = await import("@/lib/sync/sqlite");

    const manifestV1 = writeManifest(
      tmpDir,
      `
- id: lesson-1
  title: Lesson One
  subject: Math
  order: 1
- id: lesson-2
  title: Lesson Two
  subject: Math
  order: 2
`,
    );
    await syncLessonsFromManifest(manifestV1);

    db.prepare("UPDATE watch_progress SET status = 'completed' WHERE lesson_id = ?").run("lesson-2");

    const manifestV2 = writeManifest(
      tmpDir,
      `
- id: lesson-1
  title: Lesson One
  subject: Math
  order: 1
`,
    );
    const result = await syncLessonsFromManifest(manifestV2);
    expect(result).toEqual({ synced: 1, archived: 1 });

    const archived = db.prepare("SELECT archived FROM lessons WHERE id = ?").get("lesson-2") as {
      archived: number;
    };
    expect(archived.archived).toBe(1);

    const progress = db.prepare("SELECT status FROM watch_progress WHERE lesson_id = ?").get("lesson-2") as {
      status: string;
    };
    expect(progress.status).toBe("completed");
  });

  it("re-syncing an existing lesson updates its content fields without resetting progress", async () => {
    const { initSchema, db } = await import("@/lib/db");
    initSchema();
    const { syncLessonsFromManifest } = await import("@/lib/sync/sqlite");

    const manifestV1 = writeManifest(
      tmpDir,
      `
- id: lesson-1
  title: Old Title
  subject: Math
  order: 1
`,
    );
    await syncLessonsFromManifest(manifestV1);
    db.prepare("UPDATE watch_progress SET status = 'in_progress', position_seconds = 42 WHERE lesson_id = ?").run(
      "lesson-1",
    );

    const manifestV2 = writeManifest(
      tmpDir,
      `
- id: lesson-1
  title: New Title
  subject: Science
  order: 5
`,
    );
    await syncLessonsFromManifest(manifestV2);

    const lesson = db.prepare("SELECT title, subject, order_index FROM lessons WHERE id = ?").get("lesson-1") as {
      title: string;
      subject: string;
      order_index: number;
    };
    expect(lesson).toEqual({ title: "New Title", subject: "Science", order_index: 5 });

    const progress = db.prepare("SELECT status, position_seconds FROM watch_progress WHERE lesson_id = ?").get(
      "lesson-1",
    ) as { status: string; position_seconds: number };
    expect(progress).toEqual({ status: "in_progress", position_seconds: 42 });
  });

  it("preserves a watcher-auto-matched local_path when the manifest doesn't specify one", async () => {
    const { initSchema, db } = await import("@/lib/db");
    initSchema();
    const { syncLessonsFromManifest } = await import("@/lib/sync/sqlite");

    const manifestV1 = writeManifest(
      tmpDir,
      `
- id: lesson-1
  title: Lesson One
  subject: Math
  order: 1
`,
    );
    await syncLessonsFromManifest(manifestV1);
    db.prepare("UPDATE lessons SET local_path = ?, local_path_source = 'auto_matched' WHERE id = ?").run(
      "auto-matched.mp4",
      "lesson-1",
    );

    // Re-sync the same manifest entry (still no localPath specified) — the
    // auto-matched path must survive, not get clobbered back to null.
    await syncLessonsFromManifest(manifestV1);

    const lesson = db.prepare("SELECT local_path, local_path_source FROM lessons WHERE id = ?").get("lesson-1") as {
      local_path: string;
      local_path_source: string;
    };
    expect(lesson).toEqual({ local_path: "auto-matched.mp4", local_path_source: "auto_matched" });
  });
});
