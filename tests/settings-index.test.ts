import { describe, it, expect, beforeEach, vi } from "vitest";

describe("lib/settings dispatcher", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATA_BACKEND;
  });

  it("dispatches to the sqlite implementation under DATA_BACKEND=sqlite", async () => {
    const { getPreferences, updatePreferences } = await import("@/lib/settings");
    const sqliteImpl = await import("@/lib/settings/sqlite");
    expect(getPreferences).toBe(sqliteImpl.getPreferences);
    expect(updatePreferences).toBe(sqliteImpl.updatePreferences);
  });
});
