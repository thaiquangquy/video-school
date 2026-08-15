import { describe, it, expect, beforeEach, vi } from "vitest";

describe("lib/sync dispatcher", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATA_BACKEND;
  });

  it("dispatches to the sqlite implementation under DATA_BACKEND=sqlite", async () => {
    const { syncLessonsFromManifest } = await import("@/lib/sync");
    const sqliteImpl = await import("@/lib/sync/sqlite");
    expect(syncLessonsFromManifest).toBe(sqliteImpl.syncLessonsFromManifest);
  });
});
