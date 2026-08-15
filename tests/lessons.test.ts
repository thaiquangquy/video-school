import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db";
import {
  upsertProgress,
  markStatus,
  getContinueLearning,
  getLessonById,
  getAllLessons,
  resetProgress,
  getHistory,
  getHistorySummary,
  getEnrolledLessons,
  getCatalog,
  enroll,
  unenroll,
  getUnmatchedLessons,
  getLessonsWithLocalPath,
  setLocalPath,
  clearLocalPath,
} from "@/lib/lessons";

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

  it("marks in_progress when position is below the completion threshold", async () => {
    const lesson = await upsertProgress("lesson-1", { positionSeconds: 30, durationSeconds: 100, source: "local" }, testDb);
    expect(lesson?.progress.status).toBe("in_progress");
    expect(lesson?.progress.positionSeconds).toBe(30);
  });

  it("marks completed at or above the 95% threshold", async () => {
    const lesson = await upsertProgress("lesson-1", { positionSeconds: 96, durationSeconds: 100, source: "local" }, testDb);
    expect(lesson?.progress.status).toBe("completed");
  });

  it("never downgrades a completed lesson back to in_progress on rewatch", async () => {
    await upsertProgress("lesson-1", { positionSeconds: 100, durationSeconds: 100, source: "local" }, testDb);
    const rewatch = await upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    expect(rewatch?.progress.status).toBe("completed");
  });

  it("returns null for an unknown lesson id", async () => {
    const result = await upsertProgress("does-not-exist", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    expect(result).toBeNull();
  });

  it("defaults to in_progress when duration is unknown", async () => {
    const lesson = await upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: null, source: "drive" }, testDb);
    expect(lesson?.progress.status).toBe("in_progress");
  });

  it("creates one watch_events row for consecutive heartbeats within the session gap", async () => {
    await upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    await upsertProgress("lesson-1", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);

    const count = testDb.prepare("SELECT COUNT(*) AS c FROM watch_events WHERE lesson_id = ?").get("lesson-1") as {
      c: number;
    };
    expect(count.c).toBe(1);
  });

  it("starts a new watch_events row after a gap of more than 5 minutes", async () => {
    await upsertProgress("lesson-1", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);

    // Simulate the previous session having ended 10 minutes ago.
    const staleEndedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    testDb.prepare("UPDATE watch_events SET ended_at = ? WHERE lesson_id = ?").run(staleEndedAt, "lesson-1");

    await upsertProgress("lesson-1", { positionSeconds: 20, durationSeconds: 100, source: "local" }, testDb);

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

  it("sets the requested status directly, even when downgrading from completed", async () => {
    await markStatus("lesson-1", "completed", testDb);
    const lesson = await markStatus("lesson-1", "in_progress", testDb);
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

  it("never surfaces a completed lesson as continue-learning", async () => {
    await upsertProgress("lesson-a", { positionSeconds: 100, durationSeconds: 100, source: "local" }, testDb);
    const result = await getContinueLearning(testDb);
    expect(result.continueLearning).toBeNull();
  });

  it("returns the most recently watched in_progress lesson", async () => {
    await upsertProgress("lesson-a", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);
    await upsertProgress("lesson-b", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);
    const result = await getContinueLearning(testDb);
    expect(result.continueLearning?.id).toBe("lesson-b");
  });

  it("excludes completed lessons from up-next suggestions", async () => {
    await upsertProgress("lesson-a", { positionSeconds: 100, durationSeconds: 100, source: "local" }, testDb);
    const result = await getContinueLearning(testDb);
    const upNextIds = result.upNext.map((l) => l.id);
    expect(upNextIds).not.toContain("lesson-a");
    expect(upNextIds).toEqual(["lesson-b", "lesson-c"]);
  });
});

describe("getLessonById", () => {
  it("returns null for archived lessons", async () => {
    const testDb = createTestDb();
    insertLesson(testDb, { id: "lesson-1" });
    testDb.prepare("UPDATE lessons SET archived = 1 WHERE id = ?").run("lesson-1");
    expect(await getLessonById("lesson-1", testDb)).toBeNull();
  });
});

describe("getAllLessons", () => {
  it("excludes archived lessons and orders by subject, order_index, id", async () => {
    const testDb = createTestDb();
    insertLesson(testDb, { id: "b", subject: "Science", orderIndex: 1 });
    insertLesson(testDb, { id: "a", subject: "Math", orderIndex: 2 });
    insertLesson(testDb, { id: "c", subject: "Math", orderIndex: 1 });
    testDb.prepare("UPDATE lessons SET archived = 1 WHERE id = ?").run("b");

    const lessons = await getAllLessons(testDb);
    expect(lessons.map((l) => l.id)).toEqual(["c", "a"]);
  });
});

describe("resetProgress", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    insertLesson(testDb);
  });

  it("resets position/status back to not_started without touching watch_events", async () => {
    await upsertProgress("lesson-1", { positionSeconds: 50, durationSeconds: 100, source: "local" }, testDb);
    const reset = await resetProgress("lesson-1", testDb);

    expect(reset?.progress).toMatchObject({ status: "not_started", positionSeconds: 0, durationSeconds: null });

    const eventCount = testDb.prepare("SELECT COUNT(*) AS c FROM watch_events WHERE lesson_id = ?").get("lesson-1") as {
      c: number;
    };
    expect(eventCount.c).toBe(1);
  });

  it("returns null for an unknown lesson id", async () => {
    expect(await resetProgress("does-not-exist", testDb)).toBeNull();
  });
});

describe("getHistory", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    insertLesson(testDb, { id: "lesson-a" });
    insertLesson(testDb, { id: "lesson-b" });
  });

  it("returns watch sessions reverse-chronologically with a total count", async () => {
    await upsertProgress("lesson-a", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    const staleEndedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    testDb.prepare("UPDATE watch_events SET started_at = ?, ended_at = ? WHERE lesson_id = ?").run(
      staleEndedAt,
      staleEndedAt,
      "lesson-a",
    );
    await upsertProgress("lesson-b", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);

    const { items, total } = await getHistory(10, 0, testDb);
    expect(total).toBe(2);
    expect(items.map((i) => i.lessonId)).toEqual(["lesson-b", "lesson-a"]);
  });

  it("paginates via limit/offset", async () => {
    await upsertProgress("lesson-a", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);
    await upsertProgress("lesson-b", { positionSeconds: 5, durationSeconds: 100, source: "local" }, testDb);

    const page1 = await getHistory(1, 0, testDb);
    const page2 = await getHistory(1, 1, testDb);
    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page1.items[0].eventId).not.toBe(page2.items[0].eventId);
    expect(page1.total).toBe(2);
  });
});

describe("getHistorySummary", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    insertLesson(testDb, { id: "lesson-a" });
    insertLesson(testDb, { id: "lesson-b" });
  });

  it("counts completed lessons and distinct touched lessons, and sums this week's watch time", async () => {
    await upsertProgress("lesson-a", { positionSeconds: 100, durationSeconds: 100, source: "local" }, testDb);
    await upsertProgress("lesson-b", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);

    const summary = await getHistorySummary(testDb);
    expect(summary.completedCount).toBe(1);
    expect(summary.distinctLessonsTouched).toBe(2);
    expect(summary.watchTimeThisWeekSeconds).toBeGreaterThanOrEqual(0);
  });

  it("excludes watch time older than 7 days", async () => {
    await upsertProgress("lesson-a", { positionSeconds: 10, durationSeconds: 100, source: "local" }, testDb);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    testDb.prepare("UPDATE watch_events SET started_at = ?, ended_at = ? WHERE lesson_id = ?").run(
      eightDaysAgo,
      eightDaysAgo,
      "lesson-a",
    );

    const summary = await getHistorySummary(testDb);
    expect(summary.watchTimeThisWeekSeconds).toBe(0);
  });
});

describe("local-mode enrollment stubs", () => {
  it("getEnrolledLessons and getCatalog both return every non-archived lesson", async () => {
    const testDb = createTestDb();
    insertLesson(testDb, { id: "lesson-1" });

    expect((await getEnrolledLessons(testDb)).map((l) => l.id)).toEqual(["lesson-1"]);
    expect((await getCatalog(testDb)).map((l) => l.id)).toEqual(["lesson-1"]);
  });

  it("enroll/unenroll are no-ops that resolve without error", async () => {
    const testDb = createTestDb();
    await expect(enroll("any-id", testDb)).resolves.toBeUndefined();
    await expect(unenroll("any-id", testDb)).resolves.toBeUndefined();
  });
});

describe("watcher dispatch surface", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    insertLesson(testDb, { id: "lesson-1" });
    insertLesson(testDb, { id: "lesson-2" });
  });

  it("getUnmatchedLessons returns only lessons without a local_path", async () => {
    await setLocalPath("lesson-1", "1.mp4", testDb);
    const unmatched = await getUnmatchedLessons(testDb);
    expect(unmatched.map((l) => l.id)).toEqual(["lesson-2"]);
  });

  it("setLocalPath sets local_path and marks it auto_matched", async () => {
    await setLocalPath("lesson-1", "1.mp4", testDb);
    const withPath = await getLessonsWithLocalPath(testDb);
    expect(withPath).toEqual([{ id: "lesson-1", localPath: "1.mp4" }]);

    const lesson = await getLessonById("lesson-1", testDb);
    expect(lesson?.localPathSource).toBe("auto_matched");
  });

  it("clearLocalPath removes a previously auto-matched path", async () => {
    await setLocalPath("lesson-1", "1.mp4", testDb);
    await clearLocalPath("lesson-1", testDb);
    expect(await getLessonsWithLocalPath(testDb)).toEqual([]);
  });
});
