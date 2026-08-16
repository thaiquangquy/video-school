import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db";
import { getPreferences, updatePreferences } from "@/lib/settings/sqlite";

function createTestDb(): Database.Database {
  const testDb = new Database(":memory:");
  initSchema(testDb);
  return testDb;
}

describe("lib/settings/sqlite", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
  });

  describe("getPreferences", () => {
    it("returns displayName: null when no row exists yet", async () => {
      const prefs = await getPreferences(testDb);
      expect(prefs).toEqual({ displayName: null });
    });
  });

  describe("updatePreferences", () => {
    it("persists a display name that getPreferences then returns", async () => {
      await updatePreferences({ displayName: "Sam" }, testDb);
      const prefs = await getPreferences(testDb);
      expect(prefs).toEqual({ displayName: "Sam" });
    });

    it("overwrites a previously set display name", async () => {
      await updatePreferences({ displayName: "Sam" }, testDb);
      await updatePreferences({ displayName: "Alex" }, testDb);
      const prefs = await getPreferences(testDb);
      expect(prefs).toEqual({ displayName: "Alex" });
    });

    it("can clear a display name back to null", async () => {
      await updatePreferences({ displayName: "Sam" }, testDb);
      await updatePreferences({ displayName: null }, testDb);
      const prefs = await getPreferences(testDb);
      expect(prefs).toEqual({ displayName: null });
    });
  });
});
