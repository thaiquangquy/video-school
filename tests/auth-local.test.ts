import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SECRET_KEY = "SESSION_SECRET";
const PASSWORD_KEY = "APP_PASSWORD";
const originalSecret = process.env[SECRET_KEY];
const originalPassword = process.env[PASSWORD_KEY];

describe("lib/auth/local", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env[SECRET_KEY] = "test-session-secret";
    process.env[PASSWORD_KEY] = "correct-horse-battery-staple";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env[SECRET_KEY];
    else process.env[SECRET_KEY] = originalSecret;

    if (originalPassword === undefined) delete process.env[PASSWORD_KEY];
    else process.env[PASSWORD_KEY] = originalPassword;

    vi.useRealTimers();
  });

  it("checkPassword returns true for the exact APP_PASSWORD value, false otherwise", async () => {
    const { checkPassword } = await import("@/lib/auth/local");
    expect(checkPassword("correct-horse-battery-staple")).toBe(true);
    expect(checkPassword("wrong-password")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });

  it("verifySessionCookieValue accepts a freshly-created cookie", async () => {
    const { createSessionCookieValue, verifySessionCookieValue } = await import("@/lib/auth/local");
    const cookie = createSessionCookieValue();
    expect(verifySessionCookieValue(cookie)).toBe(true);
  });

  it("rejects a missing/undefined cookie value", async () => {
    const { verifySessionCookieValue } = await import("@/lib/auth/local");
    expect(verifySessionCookieValue(undefined)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { createSessionCookieValue, verifySessionCookieValue } = await import("@/lib/auth/local");
    const cookie = createSessionCookieValue();
    const [payload, signature] = cookie.split(".");
    // Flip one character of the signature half.
    const flippedChar = signature[0] === "a" ? "b" : "a";
    const tampered = `${payload}.${flippedChar}${signature.slice(1)}`;
    expect(verifySessionCookieValue(tampered)).toBe(false);
  });

  it("rejects an expired cookie signed correctly (isolated from the signature check)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const { createSessionCookieValue, verifySessionCookieValue } = await import("@/lib/auth/local");
    const cookie = createSessionCookieValue();
    expect(verifySessionCookieValue(cookie)).toBe(true);

    // Move well past the 30-day expiry with a real, correctly-signed cookie.
    vi.setSystemTime(new Date("2020-02-15T00:00:00Z"));
    expect(verifySessionCookieValue(cookie)).toBe(false);
  });

  it("rejects malformed cookie values", async () => {
    const { verifySessionCookieValue } = await import("@/lib/auth/local");
    expect(verifySessionCookieValue("no-dot-separator")).toBe(false);
    expect(verifySessionCookieValue(".")).toBe(false);
    expect(verifySessionCookieValue("")).toBe(false);
  });
});
