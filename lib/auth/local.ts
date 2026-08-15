// Local-mode auth primitives (DATA_BACKEND=sqlite): a single shared household
// password checked against APP_PASSWORD, backing an httpOnly signed-cookie
// session. No accounts, no external auth service — just an HMAC-SHA256
// signature (Node's built-in crypto, no new dependency) over an expiry
// timestamp. This module only builds sign/verify/password-check primitives;
// reading/writing the actual cookie via Next's cookies() API and the login
// route/page are task 07, and the proxy.ts gate is task 08.

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Exported so task 07/08 read/write the cookie under the same name.
export const COOKIE_NAME = "session";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Read lazily (per-call) rather than at module load — unlike lib/backend.ts's
// BACKEND, these are only exercised in local mode, so importing this module
// in a cloud-mode process (or in tests that haven't set the env yet) must not
// throw just from importing it.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}"`);
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET")).update(payload).digest("hex");
}

// Constant-time comparison of two possibly-different-length buffers.
// timingSafeEqual throws (rather than returning false) on a length mismatch,
// so the length check must happen before the call — but doing so is safe
// here: an attacker can already see cookie/password length trivially (it's
// their own submitted value), so this leaks nothing beyond what's already
// public.
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function createSessionCookieValue(): string {
  const exp = Date.now() + SESSION_DURATION_MS;
  const payload = String(exp);
  return `${payload}.${sign(payload)}`;
}

export function verifySessionCookieValue(value: string | undefined): boolean {
  if (!value) return false;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  if (!timingSafeStringEqual(signature, expected)) return false;

  const exp = Number(payload);
  return Number.isFinite(exp) && Date.now() < exp;
}

export function checkPassword(submitted: string): boolean {
  return timingSafeStringEqual(submitted, requireEnv("APP_PASSWORD"));
}

// Reads the session cookie from the current request and verifies it.
// Returns a plain boolean (falsy when absent/invalid) so callers — the
// lib/auth/index.ts dispatcher, and eventually proxy.ts (task 08) — can
// treat it the same way regardless of which backend produced it, per the
// shape contract task 14 establishes for lib/auth/supabase.ts's getSession().
export async function getSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionCookieValue(cookieStore.get(COOKIE_NAME)?.value);
}
