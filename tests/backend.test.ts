import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_KEY = "DATA_BACKEND";
const originalValue = process.env[ENV_KEY];

describe("lib/backend", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }
  });

  it("defaults to sqlite when DATA_BACKEND is unset", async () => {
    delete process.env[ENV_KEY];
    const { BACKEND, SUPPORTS_ENROLLMENT } = await import("@/lib/backend");
    expect(BACKEND).toBe("sqlite");
    expect(SUPPORTS_ENROLLMENT).toBe(false);
  });

  it("resolves to supabase when DATA_BACKEND=supabase", async () => {
    process.env[ENV_KEY] = "supabase";
    const { BACKEND, SUPPORTS_ENROLLMENT } = await import("@/lib/backend");
    expect(BACKEND).toBe("supabase");
    expect(SUPPORTS_ENROLLMENT).toBe(true);
  });

  it("throws at import time for an invalid value", async () => {
    process.env[ENV_KEY] = "bogus";
    await expect(import("@/lib/backend")).rejects.toThrow(
      /Invalid DATA_BACKEND "bogus" — must be "sqlite" or "supabase"/,
    );
  });
});
