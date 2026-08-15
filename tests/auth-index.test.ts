import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SECRET_KEY = "SESSION_SECRET";
const originalSecret = process.env[SECRET_KEY];

let mockCookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "session" && mockCookieValue !== undefined ? { value: mockCookieValue } : undefined),
  }),
}));

describe("lib/auth (sqlite dispatch) + lib/auth/local getSession", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env[SECRET_KEY] = "test-session-secret";
    mockCookieValue = undefined;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env[SECRET_KEY];
    else process.env[SECRET_KEY] = originalSecret;
  });

  it("lib/auth/local getSession returns false when no cookie is present", async () => {
    const { getSession } = await import("@/lib/auth/local");
    expect(await getSession()).toBe(false);
  });

  it("lib/auth/local getSession returns true for a valid signed cookie", async () => {
    const { createSessionCookieValue, getSession } = await import("@/lib/auth/local");
    mockCookieValue = createSessionCookieValue();
    expect(await getSession()).toBe(true);
  });

  it("the lib/auth dispatcher delegates to the local implementation under DATA_BACKEND=sqlite", async () => {
    delete process.env.DATA_BACKEND;
    const { createSessionCookieValue } = await import("@/lib/auth/local");
    mockCookieValue = createSessionCookieValue();

    const { getSession } = await import("@/lib/auth");
    expect(await getSession()).toBe(true);
  });
});
