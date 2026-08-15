import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV_KEYS = ["DB_PATH", "LESSONS_MANIFEST_PATH", "APP_CONFIG_PATH"] as const;
const originalValues = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const original = originalValues[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

function clearCachedDbConnection() {
  delete (globalThis as unknown as { __homeschoolDb?: unknown }).__homeschoolDb;
}

describe("data path env var overrides", () => {
  beforeEach(() => {
    vi.resetModules();
    clearCachedDbConnection();
  });

  afterEach(() => {
    restoreEnv();
    clearCachedDbConnection();
  });

  describe("lib/manifest MANIFEST_PATH", () => {
    it("defaults to <cwd>/data/lessons.yaml when LESSONS_MANIFEST_PATH is unset", async () => {
      delete process.env.LESSONS_MANIFEST_PATH;
      const { MANIFEST_PATH } = await import("@/lib/manifest");
      expect(MANIFEST_PATH).toBe(path.join(process.cwd(), "data", "lessons.yaml"));
    });

    it("resolves LESSONS_MANIFEST_PATH when set", async () => {
      process.env.LESSONS_MANIFEST_PATH = "e2e/fixtures/data/lessons.yaml";
      const { MANIFEST_PATH } = await import("@/lib/manifest");
      expect(MANIFEST_PATH).toBe(path.resolve("e2e/fixtures/data/lessons.yaml"));
    });
  });

  describe("lib/config CONFIG_PATH", () => {
    it("defaults to <cwd>/data/config.yaml when APP_CONFIG_PATH is unset", async () => {
      delete process.env.APP_CONFIG_PATH;
      const { CONFIG_PATH } = await import("@/lib/config");
      expect(CONFIG_PATH).toBe(path.join(process.cwd(), "data", "config.yaml"));
    });

    it("resolves APP_CONFIG_PATH when set", async () => {
      process.env.APP_CONFIG_PATH = "e2e/fixtures/data/config.yaml";
      const { CONFIG_PATH } = await import("@/lib/config");
      expect(CONFIG_PATH).toBe(path.resolve("e2e/fixtures/data/config.yaml"));
    });
  });

  describe("lib/db DB_PATH", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-school-db-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("opens the sqlite file at DB_PATH when set, creating its parent directory", async () => {
      const dbPath = path.join(tmpDir, "nested", "fixture.db");
      process.env.DB_PATH = dbPath;

      const { db } = await import("@/lib/db");

      expect(fs.existsSync(dbPath)).toBe(true);
      db.close();
    });
  });
});
