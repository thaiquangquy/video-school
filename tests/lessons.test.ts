import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db";
import { upsertProgress, markStatus, getContinueLearning, getLessonById } from "@/lib/lessons";

function createTestDb(): Database.Database {
  const testDb = new Database(":memory:");
  initSchema(testDb);
  return testDb;
}

function insertLesson(
  testDb: Database.Database,
  overrides: Partial<{ id: string; title: string; subject: string; orderIndex: number }> = {},
) {
  const lesson = {
    id: overrides.id ?? "lesson-1",
    title: overrides.title ?? "Test Lesson",
    subject: overrides.subject ?? "Math",
    orderIndex: overrides.orderIndex ?? 1,
  };

  testDb
    .prepare(
      `INSERT INTO lessons (id, title, subject, tags, local_path, local_path_source, drive_url, order_index, duration_seconds, archived)
       VALUES (@id, @title, @subject, '[]', NULL, NULL, NULL, @orderIndex, NULL, 0)`,
    )
    .run(lesson);

  testDb
    .prepare(
      `INSERT INTO watch_progress (lesson_id, position_seconds, duration_seconds, status, last_watched_at, source_last_played)
       VALUES (?, 0, NULL, 'not_started', NULL, NULL)`,
    )
    .run(lesson.id);

  return lesson;
}

describe("upsertProgress", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    insertLesson(testDb);
  });

  it("marks in_progress when position is below the completion threshold", () => {
    const lesson = upsertProgress("lesson-1", { positionSeconds: 30, durationSeconds: 100, source: "local" }, testDb);
    expect(lesson?.progress.status).toBe("in_progress");
    expect(lesson?.progress.positionSeconds).toBe(30);
  });

  it("marks completed at or above the 95% threshold", () => {
    const lesson = upsertProgress("lesson-1", { positionSeconds: 96, durationSeconds: 100, source: "local" }, testDb);
    expect(lesson?.progress.status).toBe("completed");
  });

  it("never downgrades a completed lesson back to in_progress on rewatch", () => {
    upsertProgress("lesson-1", { positionSeconds: 100, durationSeconds: 100, source: "local" }, testDb);
    const rewatch = upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    expect(rewatch?.progress.status).toBe("completed");
  });

  it("returns null for an unknown lesson id", () => {
    const result = upsertProgress("does-not-exist", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    expect(result).toBeNull();
  });

  it("defaults to in_progress when duration is unknown", () => {
    const lesson = upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: null, source: "drive" }, testDb);
    expect(lesson?.progress.status).toBe("in_progress");
  });

  it("creates one watch_events row for consecutive heartbeats within the session gap", () => {
    upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    upsertProgress("lesson-1", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);

    const count = testDb.prepare("SELECT COUNT(*) AS c FROM watch_events WHERE lesson_id = ?").get("lesson-1") as {
      c: number;
    };
    expect(count.c).toBe(1);
  });

  it("starts a new watch_events row after a gap of more than 5 minutes", () => {
    upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);

    // Simulate the previous session having ended 10 minutes ago.
    const staleEndedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    testDb.prepare("UPDATE watch_events SET ended_at = ? WHERE lesson_id = ?").run(staleEndedAt, "lesson-1");

    upsertProgress("lesson-1", { positionSeconds: 20, durationSeconds: 100, source: "local" }, testDb);

    const count = testDb.prepare("SELECT COUNT(*) AS c FROM watch_events WHERE lesson_id = ?").get("lesson-1") as {
      c: number;
    };
    expect(count.c).toBe(2);
  });
});

describe("markStatus", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    insertLesson(testDb);
  });

  it("sets the requested status directly, even when downgrading from completed", () => {
    markStatus("lesson-1", "completed", testDb);
    const lesson = markStatus("lesson-1", "in_progress", testDb);
    expect(lesson?.progress.status).toBe("in_progress");
  });
});

describe("getContinueLearning", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    insertLesson(testDb, { id: "lesson-a", orderIndex: 1 });
    insertLesson(testDb, { id: "lesson-b", orderIndex: 2 });
    insertLesson(testDb, { id: "lesson-c", orderIndex: 3 });
  });

  it("never surfaces a completed lesson as continue-learning", () => {
    upsertProgress("lesson-a", { positionSeconds: 100, durationSeconds: 100, source: "local" }, testDb);
    const result = getContinueLearning(testDb);
    expect(result.continueLearning).toBeNull();
  });

  it("returns the most recently watched in_progress lesson", () => {
    upsertProgress("lesson-a", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);
    upsertProgress("lesson-b", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);
    const result = getContinueLearning(testDb);
    expect(result.continueLearning?.id).toBe("lesson-b");
  });

  it("excludes completed lessons from up-next suggestions", () => {
    upsertProgress("lesson-a", { positionSeconds: 100, durationSeconds: 100, source: "local" }, testDb);
    const result = getContinueLearning(testDb);
    const upNextIds = result.upNext.map((l) => l.id);
    expect(upNextIds).not.toContain("lesson-a");
    expect(upNextIds).toEqual(["lesson-b", "lesson-c"]);
  });
});

describe("getLessonById", () => {
  it("returns null for archived lessons", () => {
    const testDb = createTestDb();
    insertLesson(testDb, { id: "lesson-1" });
    testDb.prepare("UPDATE lessons SET archived = 1 WHERE id = ?").run("lesson-1");
    expect(getLessonById("lesson-1", testDb)).toBeNull();
  });
});
